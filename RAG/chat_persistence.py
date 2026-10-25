"""Private chat storage. Every operation uses the caller's JWT, never the service-role client."""

from contextlib import contextmanager
import os
import re
from urllib.parse import urlparse, parse_qs
from uuid import UUID

import httpx
from fastapi import HTTPException
from supabase import AuthRetryableError, ClientOptions, create_client


def youtube_id(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    parts = parsed.path.strip("/").split("/")
    value = ""
    if parsed.scheme in ("https", "http"):
        if host == "youtu.be":
            value = parts[0]
        elif host in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            if parsed.path == "/watch":
                value = parse_qs(parsed.query).get("v", [""])[0]
            elif len(parts) == 2 and parts[0] in ("embed", "live", "shorts"):
                value = parts[1]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        raise HTTPException(422, "Provide a supported YouTube URL")
    return value


@contextmanager
def user_chat_store(authorization: str | None):
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Sign in to save conversations")
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise HTTPException(503, "Saved chat is unavailable: configure SUPABASE_ANON_KEY")
    with httpx.Client(timeout=30) as transport:
        client = create_client(url, key, options=ClientOptions(
            headers={"Authorization": f"Bearer {token.strip()}"},
            auto_refresh_token=False, persist_session=False, httpx_client=transport,
        ))
        try:
            result = client.auth.get_user(token.strip())
        except (httpx.TransportError, AuthRetryableError) as exc:
            raise HTTPException(503, "Authentication service unavailable") from exc
        except Exception as exc:
            raise HTTPException(401, "Invalid or expired session; sign in again") from exc
        if not result or not result.user or not result.user.id:
            raise HTTPException(401, "Invalid or expired session; sign in again")
        yield ChatStore(client)


class ChatStore:
    def __init__(self, client):
        self.client = client

    def _execute(self, query):
        try:
            return query.execute().data or []
        except Exception as exc:
            # Never send database details or credentials to the browser.
            raise HTTPException(503, "Chat history could not be saved or loaded; refresh and retry") from exc

    def session(self, session_id: UUID) -> dict:
        rows = self._execute(self.client.table("chat_sessions").select("*").eq("id", str(session_id)))
        if not rows:
            raise HTTPException(404, "Chat session not found")
        return rows[0]

    def messages(self, session_id: UUID, request_id: UUID) -> list[dict]:
        return self._execute(self.client.table("chat_messages").select("*")
                             .eq("session_id", str(session_id)).eq("request_id", str(request_id)))

    def question(self, session_id: UUID, request_id: UUID, content: str) -> tuple[dict, dict | None]:
        rows = self.messages(session_id, request_id)
        question = next((row for row in rows if row["role"] == "user"), None)
        if question is None:
            self._execute(self.client.table("chat_messages").upsert({
                "session_id": str(session_id), "request_id": str(request_id),
                "role": "user", "content": content,
            }, on_conflict="session_id,request_id,role", ignore_duplicates=True))
            rows = self.messages(session_id, request_id)
            question = next((row for row in rows if row["role"] == "user"), None)
        if question is None:
            raise HTTPException(503, "Question was not saved; refresh and retry")
        if question["content"] != content:
            raise HTTPException(409, "This request ID already belongs to another question")
        return question, next((row for row in rows if row["role"] == "assistant"), None)

    def answer(self, session_id: UUID, request_id: UUID, result: dict) -> dict:
        self._execute(self.client.table("chat_messages").upsert({
            "session_id": str(session_id), "request_id": str(request_id), "role": "assistant",
            "content": result["response"], "sources": result["sources"],
            "suggestions": result["suggestions"], "provider": result["provider"], "model": result["model"],
        }, on_conflict="session_id,request_id,role", ignore_duplicates=True))
        rows = self.messages(session_id, request_id)
        answer = next((row for row in rows if row["role"] == "assistant"), None)
        if answer is None:
            raise HTTPException(503, "Answer was not saved; refresh and retry")
        return answer


def saved_response(session_id: UUID, request_id: UUID, question: dict, answer: dict) -> dict:
    return {
        "response": answer["content"], "sources": answer["sources"],
        "suggestions": answer["suggestions"], "provider": answer.get("provider"), "model": answer.get("model"),
        "session_id": str(session_id), "request_id": str(request_id),
        "user_message_id": question["id"], "assistant_message_id": answer["id"],
    }
