"""Per-conversation chat isolation and cleanup."""

import re
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from chat_sessions import ChatSessionStore, normalize_conversation_id
from conftest import FakeGeminiChat


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_sessions_are_isolated_per_conversation():
    store = ChatSessionStore()
    a = store.get("conv-aaaaaaaa", "ID::1")
    b = store.get("conv-bbbbbbbb", "ID::1")
    a.add_turn("qa", "aa")

    assert store.get("conv-aaaaaaaa", "ID::1").history == [("qa", "aa")]
    assert b.history == []


def test_switching_transcript_starts_fresh_history():
    store = ChatSessionStore()
    store.get("conv-aaaaaaaa", "ID::1").add_turn("q", "a")
    assert store.get("conv-aaaaaaaa", "ID::2").history == []


def test_idle_sessions_expire():
    clock = FakeClock()
    store = ChatSessionStore(ttl_seconds=60, clock=clock)
    store.get("conv-aaaaaaaa", "ID::1").add_turn("q", "a")
    clock.now += 30
    store.get("conv-bbbbbbbb", "ID::1")
    clock.now += 45  # a idle 75s, b idle 45s

    assert store.get("conv-aaaaaaaa", "ID::1").history == []
    assert len(store) == 2  # expired a was dropped and recreated; b survived


def test_store_drops_least_recently_used_beyond_cap():
    store = ChatSessionStore(max_sessions=2)
    store.get("conv-11111111", "ID::1").add_turn("q", "a")
    store.get("conv-22222222", "ID::1")
    store.get("conv-11111111", "ID::1")  # touch 1, so 2 is least recently used
    store.get("conv-33333333", "ID::1")

    assert len(store) == 2
    assert store.get("conv-11111111", "ID::1").history == [("q", "a")]


def test_history_keeps_recent_turns_only():
    session = ChatSessionStore().get("conv-aaaaaaaa", "ID::1")
    for i in range(5):
        session.add_turn(f"q{i}", f"a{i}", max_turns=3)
    assert [q for q, _ in session.history] == ["q2", "q3", "q4"]


@pytest.mark.parametrize("value", [None, "", "short", "has spaces in it", "x" * 65, "../../etc/passwd"])
def test_invalid_conversation_ids_are_replaced(value):
    minted = normalize_conversation_id(value)
    assert minted != value and re.fullmatch(r"[0-9a-f-]{36}", minted)


def test_client_conversation_id_is_kept():
    assert normalize_conversation_id("3f2a6c1e-8a7b-4c1d-9e2f-0a1b2c3d4e5f") == "3f2a6c1e-8a7b-4c1d-9e2f-0a1b2c3d4e5f"


@pytest.fixture
def client(gemini_only, monkeypatch):
    import api_chatbot

    monkeypatch.setattr(api_chatbot, "chat_sessions", ChatSessionStore())
    return TestClient(api_chatbot.app), api_chatbot


def test_chat_returns_and_reuses_conversation_id(client):
    http, api_chatbot = client
    first = http.post("/chat", json={"message": "q1", "id": "1"}).json()
    conversation_id = first["conversation_id"]

    http.post("/chat", json={"message": "q2", "id": "1", "conversation_id": conversation_id})

    history = api_chatbot.chat_sessions.get(conversation_id, "ID::1").history
    assert [q for q, _ in history] == ["q1", "q2"]


def test_concurrent_conversations_never_share_history(client):
    http, api_chatbot = client
    FakeGeminiChat.delay_seconds = 0.02  # keep requests in flight at the same time
    conversations = {name: f"conv-{name * 8}" for name in "abcd"}
    dashboards = {"a": "1", "b": "1", "c": "2", "d": "3"}  # two users share a transcript

    def converse(name):
        for turn in range(3):
            body = http.post("/chat", json={
                "message": f"{name.upper()}-{turn}",
                "id": dashboards[name],
                "conversation_id": conversations[name],
            }).json()
            assert body["conversation_id"] == conversations[name]
            assert body["response"] == f"gemini answer to: {name.upper()}-{turn}"

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(converse, "abcd"))

    for name, conversation_id in conversations.items():
        history = api_chatbot.chat_sessions.get(conversation_id, f"ID::{dashboards[name]}").history
        assert [q for q, _ in history] == [f"{name.upper()}-{t}" for t in range(3)]

    # Every prompt sent to the model mentions turns from exactly one conversation
    for prompt in FakeGeminiChat.prompts:
        owners = set(re.findall(r"\b([A-D])-\d\b", prompt))
        assert len(owners) <= 1, prompt
