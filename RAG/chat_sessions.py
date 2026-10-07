"""
Per-conversation chat state for the /chat endpoint.

Each browser conversation sends its own conversation_id; history is kept per id so concurrent
users (or tabs) never see each other's questions. Sessions expire after CHAT_SESSION_TTL_SECONDS
of inactivity, the store holds at most CHAT_MAX_SESSIONS (least recently used are dropped first),
and each session keeps its last CHAT_MAX_TURNS exchanges.
"""

import os
import re
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Callable, Optional

CHAT_SESSION_TTL_SECONDS = int(os.getenv("CHAT_SESSION_TTL_SECONDS", "3600"))
CHAT_MAX_SESSIONS = int(os.getenv("CHAT_MAX_SESSIONS", "1000"))
CHAT_MAX_TURNS = int(os.getenv("CHAT_MAX_TURNS", "20"))

_CONVERSATION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def normalize_conversation_id(value: Optional[str]) -> str:
    """Accept a client-generated id (e.g. crypto.randomUUID()) or mint a new one."""
    if value and _CONVERSATION_ID_RE.match(value):
        return value
    return str(uuid.uuid4())


@dataclass
class ChatSession:
    conversation_id: str
    source_key: str
    transcript_path: Optional[str] = None
    history: list[tuple[str, str]] = field(default_factory=list)
    last_used: float = 0.0
    # Serializes turns within one conversation; different conversations run concurrently
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add_turn(self, question: str, answer: str, max_turns: int = CHAT_MAX_TURNS) -> None:
        self.history.append((question, answer))
        del self.history[:-max_turns]


class ChatSessionStore:
    def __init__(
        self,
        ttl_seconds: int = CHAT_SESSION_TTL_SECONDS,
        max_sessions: int = CHAT_MAX_SESSIONS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self._clock = clock
        self._sessions: "OrderedDict[str, ChatSession]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, conversation_id: str, source_key: str) -> ChatSession:
        """
        Return the session for this conversation, starting a fresh one if it is new, expired,
        or was talking about a different transcript.
        """
        now = self._clock()
        with self._lock:
            self._evict_expired(now)
            session = self._sessions.get(conversation_id)
            if session is None or session.source_key != source_key:
                session = ChatSession(conversation_id=conversation_id, source_key=source_key)
                self._sessions[conversation_id] = session
            session.last_used = now
            self._sessions.move_to_end(conversation_id)
            while len(self._sessions) > self.max_sessions:
                self._sessions.popitem(last=False)
            return session

    def discard(self, conversation_id: str) -> None:
        with self._lock:
            self._sessions.pop(conversation_id, None)

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)

    def _evict_expired(self, now: float) -> None:
        # Sessions are ordered by last use, so expired ones are at the front
        while self._sessions:
            oldest = next(iter(self._sessions.values()))
            if now - oldest.last_used <= self.ttl_seconds:
                break
            self._sessions.popitem(last=False)
