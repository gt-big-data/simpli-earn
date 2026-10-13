"""Request size limits: schema limits on /chat fields and a body cap applied before parsing."""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

import api_chatbot
from api_chatbot import BodySizeLimitMiddleware


@pytest.fixture
def client(gemini_only):
    return TestClient(api_chatbot.app)


def chat(client, **overrides):
    return client.post("/chat", json={"message": "q", "id": "1", **overrides})


def turn(question="q", answer="a"):
    return {"question": question, "answer": answer}


def test_request_at_the_limits_is_accepted(client):
    history = [turn("q" * 2000, "a" * 8000)] * 20
    res = chat(client, message="m" * 2000, history=history)
    assert res.status_code == 200
    assert len(json.dumps({"message": "m" * 2000, "history": history})) < api_chatbot.MAX_REQUEST_BODY_BYTES


@pytest.mark.parametrize("overrides", [
    {"history": [turn()] * 21},
    {"history": [turn(question="q" * 2001)]},
    {"history": [turn(answer="a" * 8001)]},
    {"message": "m" * 2001},
    {"message": ""},
    {"id": "x" * 201},
])
def test_oversized_fields_are_rejected_by_validation(client, overrides):
    assert chat(client, **overrides).status_code == 422


def test_body_over_the_cap_is_rejected_before_parsing(client):
    # Validation would answer 422 (message too long); 413 shows the body never reached it
    body = b'{"message": "' + b"x" * (api_chatbot.MAX_REQUEST_BODY_BYTES + 1) + b'"}'

    res = client.post("/chat", content=body, headers={"Content-Type": "application/json",
                                                       "Origin": "http://localhost:3000"})

    assert res.status_code == 413
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"  # browser can read the error


def run_asgi(middleware, chunks, headers=()):
    """Drive the middleware with a streamed body and return (status, app_was_called, body_seen_by_app)."""
    seen = {}

    async def app(scope, receive, send):
        message = await receive()
        seen["body"] = message["body"]
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    queue = [{"type": "http.request", "body": c, "more_body": i < len(chunks) - 1} for i, c in enumerate(chunks)]
    sent = []

    async def receive():
        return queue.pop(0)

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/chat", "headers": list(headers)}
    asyncio.run(middleware(app)(scope, receive, send))
    return sent[0]["status"], "body" in seen, seen.get("body")


def limited(max_bytes):
    return lambda app: BodySizeLimitMiddleware(app, max_bytes=max_bytes)


def test_chunked_body_without_content_length_is_counted():
    assert run_asgi(limited(10), [b"12345", b"67890", b"1"])[:2] == (413, False)


def test_wrong_content_length_does_not_bypass_the_cap():
    assert run_asgi(limited(10), [b"x" * 11], headers=[(b"content-length", b"5")])[:2] == (413, False)


def test_body_within_cap_reaches_the_app_intact():
    assert run_asgi(limited(10), [b"12345", b"67890"]) == (200, True, b"1234567890")
