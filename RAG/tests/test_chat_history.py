"""/chat is stateless: follow-up context comes from the history the browser sends with each request."""

import re
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from conftest import FakeGeminiChat


@pytest.fixture
def client(gemini_only):
    import api_chatbot

    return TestClient(api_chatbot.app), api_chatbot


def turns(*pairs):
    return [{"question": q, "answer": a} for q, a in pairs]


def test_first_message_without_history_skips_condensing(client):
    http, _ = client
    body = http.post("/chat", json={"message": "How did revenue do?", "id": "1"}).json()

    assert body["response"] == "gemini answer to: How did revenue do?"
    assert not any("Standalone question:" in p for p in FakeGeminiChat.prompts)


def test_sent_history_reaches_condense_and_answer_prompts(client):
    http, _ = client
    http.post("/chat", json={"message": "And margins?", "id": "1",
                             "history": turns(("How did revenue do?", "Revenue grew 12%."))})

    condense = [p for p in FakeGeminiChat.prompts if "Standalone question:" in p]
    assert condense and "Human: How did revenue do?\nAssistant: Revenue grew 12%." in condense[0]
    answer = [p for p in FakeGeminiChat.prompts if "Chat History:" in p and "Context:" in p]
    assert answer and "Human: How did revenue do?" in answer[0]


def test_nothing_is_remembered_between_requests(client):
    """Any Cloud Run instance can serve the next turn; a request without history has no context."""
    http, _ = client
    http.post("/chat", json={"message": "SECRET-QUESTION", "id": "1"})
    FakeGeminiChat.prompts.clear()

    http.post("/chat", json={"message": "next", "id": "1"})

    assert not any("SECRET-QUESTION" in p for p in FakeGeminiChat.prompts)


def test_only_the_most_recent_turns_are_used(client, monkeypatch):
    http, api_chatbot = client
    monkeypatch.setattr(api_chatbot, "CHAT_MAX_TURNS", 2)
    history = turns(("q0", "a0"), ("q1", "a1"), ("q2", "a2"), ("", "empty question dropped"))

    assert api_chatbot.chat_history_from_request([api_chatbot.ChatTurn(**t) for t in history]) == [("q2", "a2")]
    http.post("/chat", json={"message": "follow", "id": "1", "history": history})
    assert not any("q0" in p or "q1" in p for p in FakeGeminiChat.prompts)


def test_old_clients_sending_conversation_id_still_work(client):
    http, _ = client
    res = http.post("/chat", json={"message": "hi", "id": "1", "conversation_id": "3f2a6c1e-8a7b-4c1d"})
    assert res.status_code == 200 and res.json()["response"] == "gemini answer to: hi"


def test_concurrent_requests_only_see_their_own_history(client):
    http, _ = client
    FakeGeminiChat.delay_seconds = 0.02  # keep requests in flight at the same time
    dashboards = {"a": "1", "b": "1", "c": "2", "d": "3"}  # two users share a transcript

    def converse(name):
        history = []
        for turn in range(3):
            message = f"{name.upper()}-{turn}"
            body = http.post("/chat", json={"message": message, "id": dashboards[name], "history": history}).json()
            assert body["response"] == f"gemini answer to: {message}"
            history = history + [{"question": message, "answer": body["response"]}]

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(converse, "abcd"))

    for prompt in FakeGeminiChat.prompts:
        owners = set(re.findall(r"\b([A-D])-\d\b", prompt))
        assert len(owners) <= 1, prompt
