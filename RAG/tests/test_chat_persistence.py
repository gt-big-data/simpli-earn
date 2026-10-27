"""Saved chat protocol, failures, retries and request-scoped JWT forwarding (no network)."""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from threading import Lock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import api_chatbot as api
import chat_persistence as persistence

ALICE, BOB = str(uuid4()), str(uuid4())
SESSION, OTHER = str(uuid4()), str(uuid4())


class Database:
    def __init__(self):
        self.sessions = {
            SESSION: {"id": SESSION, "user_id": ALICE, "dashboard_key": "preloaded:1"},
            OTHER: {"id": OTHER, "user_id": BOB, "dashboard_key": "preloaded:1"},
        }
        self.rows = {}
        self.lock = Lock()
        self.fail_role = None
        self.check_role = None  # role whose insert breaks a CHECK constraint (23514)
        self.starts = 0

    def client(self, owner):
        db = self

        class Start:
            """migration 004's chat_start: chat and first question commit together or not at all."""
            def __init__(self, params):
                self.params = params

            def execute(self):
                p = self.params
                with db.lock:
                    if p["p_session_id"] in db.sessions:
                        raise APIError({"code": "23505", "message": "duplicate key value"})
                    if db.fail_role == "user":
                        raise RuntimeError("database rejected write")
                    if db.check_role == "user":
                        raise APIError({"code": "23514", "message": "violates check constraint"})
                    db.starts += 1
                    db.sessions[p["p_session_id"]] = {
                        "id": p["p_session_id"], "user_id": owner, "dashboard_key": p["p_dashboard_key"],
                        "dashboard_id": p["p_dashboard_id"], "video_identifier": p["p_video_identifier"],
                        "title": p["p_title"],
                    }
                    db.rows[(p["p_session_id"], p["p_request_id"], "user")] = {
                        "id": str(uuid4()), "session_id": p["p_session_id"], "request_id": p["p_request_id"],
                        "role": "user", "content": p["p_content"], "sources": [], "suggestions": [],
                    }
                return SimpleNamespace(data=None)

        class Query:
            def __init__(self, table):
                self.table = table
                self.filters = {}
                self.row = None

            def select(self, _): return self
            def eq(self, key, value): self.filters[key] = value; return self
            def upsert(self, row, **options):
                assert options == {"on_conflict": "session_id,request_id,role", "ignore_duplicates": True}
                self.row = row
                return self

            def execute(self):
                with db.lock:
                    if self.row:
                        row = self.row
                        if db.check_role == row["role"] or len(row["content"]) > 50000:  # migration 004 caps
                            raise APIError({"code": "23514", "message": "violates check constraint"})
                        parent = db.sessions.get(row["session_id"])
                        if not parent or parent["user_id"] != owner or db.fail_role == row["role"]:
                            raise RuntimeError("database rejected write")
                        key = (row["session_id"], row["request_id"], row["role"])
                        db.rows.setdefault(key, {"id": str(uuid4()), "sources": [], "suggestions": [], **row})
                        return SimpleNamespace(data=[])
                    rows = list(db.sessions.values()) if self.table == "chat_sessions" else [
                        row for row in db.rows.values() if db.sessions.get(row["session_id"], {}).get("user_id") == owner
                    ]
                    rows = [row for row in rows if (self.table != "chat_sessions" or row["user_id"] == owner)
                            and all(row.get(k) == v for k, v in self.filters.items())]
                    return SimpleNamespace(data=rows)

        def rpc(name, params):
            assert name == "chat_start"
            return Start(params)

        return SimpleNamespace(table=lambda table: Query(table), rpc=rpc)


@pytest.fixture
def saved_client(monkeypatch, gemini_only):
    db = Database()

    @contextmanager
    def store(header):
        if header == "Bearer outage":
            raise HTTPException(503, "Authentication service unavailable")
        if header not in ("Bearer alice", "Bearer bob"):
            raise HTTPException(401, "Invalid or expired session")
        yield persistence.ChatStore(db.client(ALICE if header == "Bearer alice" else BOB))

    monkeypatch.setattr(api, "user_chat_store", store)
    return TestClient(api.app), db


def post(client, request_id=None, session_id=SESSION, token="alice", **overrides):
    return client.post("/chat", headers={"Authorization": f"Bearer {token}"} if token else {}, json={
        "message": "Revenue?", "id": "1", "session_id": session_id,
        "request_id": request_id or str(uuid4()), **overrides,
    })


def test_saved_answer_and_metadata_are_committed_before_success(saved_client):
    client, db = saved_client
    request = str(uuid4())
    response = post(client, request).json()
    assert response["session_id"] == SESSION and response["request_id"] == request
    user = db.rows[(SESSION, request, "user")]
    answer = db.rows[(SESSION, request, "assistant")]
    assert response["user_message_id"] == user["id"]
    assert response["assistant_message_id"] == answer["id"]
    assert answer["content"] == response["response"]
    assert answer["sources"] and answer["sources"] == response["sources"]
    assert answer["suggestions"] == response["suggestions"]
    assert response["provider"] == "gemini"
    assert response["model"] == "gemini-3.1-flash-lite"


@pytest.mark.parametrize("source,key,locator", [
    ({"id": "1"}, "preloaded:1", ("1", None)),
    ({"id": None, "video_url": "https://youtu.be/5EVhGtYa1B0?si=x"}, "youtube:5EVhGtYa1B0", (None, "5EVhGtYa1B0")),
])
def test_first_send_creates_the_chat_with_its_question(saved_client, monkeypatch, source, key, locator):
    client, db = saved_client
    monkeypatch.setattr(api, "_resolve_chat_transcript", lambda *args: (api.STATIC_TRANSCRIPTS["1"], None))
    chat, request = str(uuid4()), str(uuid4())
    response = post(client, request, session_id=chat, title="  Revenue?  ", **source)
    assert response.status_code == 200 and response.json()["session_id"] == chat
    assert db.sessions[chat] == {"id": chat, "user_id": ALICE, "dashboard_key": key, "dashboard_id": locator[0],
                                 "video_identifier": locator[1], "title": "Revenue?"}
    assert sorted(role for sid, _, role in db.rows if sid == chat) == ["assistant", "user"]


@pytest.mark.parametrize("failure,status", [("bad token", 401), ("auth outage", 503), ("unknown dashboard", 422),
                                            ("unsupported video", 422), ("question save", 503)])
def test_first_send_failing_before_its_question_saves_leaves_no_chat(saved_client, monkeypatch, failure, status):
    client, db = saved_client
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("inference before the question saved"))
    args = {"bad token": {"token": "expired"}, "auth outage": {"token": "outage"},
            "unknown dashboard": {"id": "unknown"}, "unsupported video": {"video_url": "https://example.com/v"},
            "question save": {}}[failure]
    if failure == "question save":
        db.fail_role = "user"
    chat = str(uuid4())
    assert post(client, session_id=chat, title="Revenue?", **args).status_code == status
    assert chat not in db.sessions and not db.rows


def test_retried_first_send_reuses_one_chat(saved_client, monkeypatch):
    # The first attempt saves the chat and question, then inference fails; retries send the title again.
    client, db = saved_client
    chat, request = str(uuid4()), str(uuid4())
    original = api._chat_answer

    def unavailable(*args, **kwargs):
        raise HTTPException(503, "AI unavailable")

    monkeypatch.setattr(api, "_chat_answer", unavailable)
    assert post(client, request, session_id=chat, title="Revenue?").status_code == 503
    assert chat in db.sessions and (chat, request, "user") in db.rows
    monkeypatch.setattr(api, "_chat_answer", original)
    first = post(client, request, session_id=chat, title="Revenue?")
    assert first.status_code == 200
    assert post(client, request, session_id=chat, title="Revenue?").json() == first.json()
    assert db.starts == 1 and len(db.rows) == 2


def test_concurrent_first_sends_create_one_chat(saved_client):
    client, db = saved_client
    chat, request = str(uuid4()), str(uuid4())
    with ThreadPoolExecutor(max_workers=3) as executor:
        responses = list(executor.map(lambda _: post(client, request, session_id=chat, title="Revenue?"), range(3)))
    assert all(response.status_code == 200 for response in responses)
    assert db.starts == 1 and len(db.rows) == 2
    assert len({response.json()["assistant_message_id"] for response in responses}) == 1


def test_first_send_cannot_claim_another_users_chat_id(saved_client, monkeypatch):
    client, db = saved_client
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("inference in another user's chat"))
    before = dict(db.sessions[OTHER])
    assert post(client, session_id=OTHER, title="Mine now").status_code == 404
    assert db.sessions[OTHER] == before and not db.rows


@pytest.mark.parametrize("token,session,status", [(None, SESSION, 401), ("expired", SESSION, 401),
    ("bob", SESSION, 404), ("alice", str(uuid4()), 404)])
def test_auth_or_ownership_failure_never_invokes_model(saved_client, monkeypatch, token, session, status):
    client, db = saved_client
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("unauthorized inference"))
    assert post(client, token=token, session_id=session).status_code == status
    assert not db.rows


def test_source_mismatch_never_invokes_model(saved_client, monkeypatch):
    client, db = saved_client
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("wrong transcript inference"))
    assert post(client, id="2").status_code == 409
    assert post(client, id="unknown").status_code == 422
    assert not db.rows


def test_saved_retry_returns_first_answer_without_another_model_call(saved_client, monkeypatch):
    client, db = saved_client
    request = str(uuid4())
    first = post(client, request)
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("retry regenerated an existing answer"))
    assert post(client, request).json() == first.json()
    assert post(client, request, message="Different question").status_code == 409
    assert len(db.rows) == 2


@pytest.mark.parametrize("failure", ["model", "database", "deleted"])
def test_failed_turn_never_returns_saved_success(saved_client, monkeypatch, failure):
    client, db = saved_client
    request = str(uuid4())
    original = api._chat_answer

    def answer(*args, **kwargs):
        if failure == "model": raise HTTPException(503, "AI unavailable")
        result = original(*args, **kwargs)
        if failure == "database": db.fail_role = "assistant"
        else: db.sessions.pop(SESSION)
        return result

    monkeypatch.setattr(api, "_chat_answer", answer)
    result = post(client, request)
    assert result.status_code == 503
    assert "assistant_message_id" not in result.json()
    assert (SESSION, request, "user") in db.rows
    assert (SESSION, request, "assistant") not in db.rows


def test_failed_question_is_retryable_with_same_id(saved_client, monkeypatch):
    client, db = saved_client
    request = str(uuid4())
    db.fail_role = "assistant"
    assert post(client, request).status_code == 503
    db.fail_role = None
    assert post(client, request).status_code == 200
    assert len(db.rows) == 2


def test_concurrent_retries_save_one_pair(saved_client):
    client, db = saved_client
    request = str(uuid4())
    with ThreadPoolExecutor(max_workers=3) as executor:
        responses = list(executor.map(lambda _: post(client, request), range(3)))
    assert all(response.status_code == 200 for response in responses)
    assert len(db.rows) == 2
    assert len({response.json()["assistant_message_id"] for response in responses}) == 1


def test_saved_path_transcript_error_is_not_an_answer(saved_client, monkeypatch):
    client, db = saved_client
    monkeypatch.setattr(api, "_resolve_chat_transcript", lambda *args: (None, "Error: missing transcript"))
    assert post(client).status_code == 422
    assert {row["role"] for row in db.rows.values()} == {"user"}


def test_answer_over_a_storage_cap_is_returned_marked_unsaved(saved_client, monkeypatch):
    client, db = saved_client
    long_answer = "Revenue grew. " * 4000  # 56,000 characters: over the 50,000 content cap
    monkeypatch.setattr(api, "answer_question", lambda *a, **k: {
        "answer": long_answer, "source_documents": [], "provider": "gemini", "model": "gemini-3.1-flash-lite"})
    request = str(uuid4())
    result = post(client, request)
    assert result.status_code == 200
    body = result.json()
    assert body["saved"] is False and body["not_saved_reason"]
    assert body["response"] == long_answer and body["session_id"] == SESSION and body["request_id"] == request
    assert body["user_message_id"] == db.rows[(SESSION, request, "user")]["id"]
    assert "assistant_message_id" not in body
    assert (SESSION, request, "assistant") not in db.rows


def test_saved_answer_is_marked_saved(saved_client):
    client, _ = saved_client
    assert post(client).json()["saved"] is True


@pytest.mark.parametrize("first_send", [False, True])
def test_question_rejected_by_a_check_is_a_4xx_without_inference(saved_client, monkeypatch, first_send):
    client, db = saved_client
    db.check_role = "user"
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("rejected question reached inference"))
    session = str(uuid4()) if first_send else SESSION
    result = post(client, session_id=session, **({"title": "Revenue?"} if first_send else {}))
    assert result.status_code == 422 and "can't be saved" in result.json()["detail"]
    assert not db.rows and (not first_send or session not in db.sessions)


def test_question_save_failure_never_invokes_model(saved_client, monkeypatch):
    client, db = saved_client
    db.fail_role = "user"
    monkeypatch.setattr(api, "_chat_answer", lambda *a, **k: pytest.fail("unsaved question reached inference"))
    assert post(client).status_code == 503
    assert not db.rows


def test_blank_model_output_is_not_saved_as_a_complete_answer(saved_client, monkeypatch):
    client, db = saved_client
    monkeypatch.setattr(api, "answer_question", lambda *a, **k: {"answer": " \n ", "source_documents": []})
    assert post(client).status_code == 503
    assert {row["role"] for row in db.rows.values()} == {"user"}


def test_answer_metadata_does_not_change_during_suggestion_generation(saved_client, monkeypatch):
    import llm_provider
    client, _ = saved_client

    def suggestions(**_):
        monkeypatch.setattr(llm_provider, "GEMINI_API_KEY", "")
        return ["Follow up?"]

    monkeypatch.setattr(api, "generate_follow_up_questions", suggestions)
    result = post(client).json()
    assert llm_provider.get_active_provider() == "none"
    assert result["provider"] == "gemini" and result["model"] == "gemini-3.1-flash-lite"


def test_custom_source_is_normalized_before_loading_transcript(saved_client, monkeypatch):
    client, db = saved_client
    db.sessions[SESSION]["dashboard_key"] = "youtube:5EVhGtYa1B0"
    seen = []

    def resolve(req, _):
        seen.append((req.id, req.video_url))
        return api.STATIC_TRANSCRIPTS["1"], None

    monkeypatch.setattr(api, "_resolve_chat_transcript", resolve)
    assert post(client, video_url="https://youtu.be/5EVhGtYa1B0?si=x").status_code == 200
    assert seen == [(None, "https://www.youtube.com/watch?v=5EVhGtYa1B0")]


def test_uuid_pair_and_signed_in_protocol(saved_client):
    client, _ = saved_client
    assert client.post("/chat", json={"message": "q", "session_id": SESSION}).status_code == 422
    assert post(client, request_id="invalid").status_code == 422
    assert client.post("/chat", json={"message": "q", "id": "1"}, headers={"Authorization": "Bearer alice"}).status_code == 422
    assert client.post("/chat", json={"message": "q", "id": "1", "title": "guest"}).status_code == 422
    assert post(client, session_id=str(uuid4()), title="   ").status_code == 422


def test_actual_sdk_forwards_separate_jwts_and_closes_transports(monkeypatch):
    original = httpx.Client
    seen, clients = [], []

    def handle(request):
        seen.append((request.url.path, request.headers.get("authorization"), request.headers.get("apikey")))
        if request.url.path.endswith("/user"):
            return httpx.Response(200, json={"id": ALICE, "aud": "authenticated", "created_at": "2026-10-25T00:00:00Z",
                                             "app_metadata": {}, "user_metadata": {}})
        return httpx.Response(200, json=[])

    class MockClient(original):
        def __init__(self, **kwargs):
            super().__init__(**kwargs, transport=httpx.MockTransport(handle))
            clients.append(self)

    monkeypatch.setattr(persistence.httpx, "Client", MockClient)
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    for token in ("alice", "bob"):
        with persistence.user_chat_store(f"Bearer {token}") as store:
            assert store.messages(SESSION, str(uuid4())) == []
    assert [auth for _, auth, _ in seen] == ["Bearer alice", "Bearer alice", "Bearer bob", "Bearer bob"]
    assert all(key == "test-anon" for _, _, key in seen)
    assert all(client.is_closed for client in clients)


@pytest.mark.parametrize("header", [None, "", "Basic token", "Bearer "])
def test_missing_or_malformed_bearer_is_rejected(header):
    with pytest.raises(HTTPException) as error:
        with persistence.user_chat_store(header): pytest.fail("unauthenticated store")
    assert error.value.status_code == 401


def test_youtube_normalization_matches_all_catalog_videos():
    for video in api.PRELOADED_VIDEOS.values():
        video_id = persistence.youtube_id(video["url"])
        for url in (f"https://youtu.be/{video_id}?si=x", f"https://www.youtube.com/embed/{video_id}",
                    f"https://youtube.com/live/{video_id}", f"https://m.youtube.com/shorts/{video_id}"):
            assert persistence.youtube_id(url) == video_id
    with pytest.raises(HTTPException): persistence.youtube_id("https://youtube.com.attacker.example/watch?v=5EVhGtYa1B0")


@pytest.mark.parametrize("status,expected", [(401, 401), (403, 401), (500, 503), (429, 503), (503, 503)])
def test_auth_server_failure_never_falls_back_to_guest(monkeypatch, status, expected):
    original = httpx.Client

    class MockClient(original):
        def __init__(self, **kwargs):
            super().__init__(**kwargs, transport=httpx.MockTransport(lambda request: httpx.Response(
                status, json={"code": "bad_jwt", "msg": "Auth unavailable"})))

    monkeypatch.setattr(persistence.httpx, "Client", MockClient)
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    with pytest.raises(HTTPException) as error:
        with persistence.user_chat_store("Bearer invalid-or-expired"):
            pytest.fail("auth failure reached chat storage")
    assert error.value.status_code == expected
