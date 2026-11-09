"""Explicit opt-in Supabase REST integration test. Creates/deletes TWO test auth users.

Use only a local/disposable Supabase project with migration 004 applied.
Run: venv/bin/python tests/check_chat_rls.py
Required environment: CHAT_TEST_SUPABASE_URL, CHAT_TEST_SUPABASE_ANON_KEY,
CHAT_TEST_SUPABASE_SERVICE_ROLE_KEY. Secrets are never printed.
"""
import os
import secrets
from datetime import datetime
from uuid import uuid4

import httpx


def when(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp)


def main():
    names = ("CHAT_TEST_SUPABASE_URL", "CHAT_TEST_SUPABASE_ANON_KEY", "CHAT_TEST_SUPABASE_SERVICE_ROLE_KEY")
    values = [os.getenv(name, "") for name in names]
    if not all(values):
        raise SystemExit("Set all CHAT_TEST_SUPABASE_* variables for a disposable project; see docs/CHAT_HISTORY.md")
    url, anon, service = values
    users = []
    with httpx.Client(base_url=url.rstrip("/"), timeout=30) as client:
        def request(method, path, body=None, token=None, admin=False, prefer="return=representation"):
            key = service if admin else anon
            headers = {"apikey": key, "Prefer": prefer}
            if admin or token:
                headers["Authorization"] = f"Bearer {service if admin else token}"
            return client.request(method, path, json=body, headers=headers)

        def ok(response):
            if not response.is_success:
                raise AssertionError(f"Unexpected HTTP {response.status_code} on {response.request.url.path}")
            return response.json() if response.content else None

        def denied(response):
            assert response.status_code in (401, 403), f"Expected denial, got HTTP {response.status_code}"

        try:
            tokens = []
            for _ in range(2):
                email, password = f"chat-rls-{uuid4()}@test.invalid", secrets.token_urlsafe(36)
                user = ok(request("POST", "/auth/v1/admin/users", {
                    "email": email, "password": password, "email_confirm": True,
                }, admin=True))
                users.append(user["id"])
                token = ok(request("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password}))
                tokens.append(token["access_token"])
            alice, bob = tokens
            sessions = []
            for token in tokens:
                rows = ok(request("POST", "/rest/v1/chat_sessions", {
                    "dashboard_key": "preloaded:1", "dashboard_id": "1", "title": "RLS integration fixture",
                }, token))
                sessions.append(rows[0]["id"])
            sid, other = sessions
            request_id = str(uuid4())
            question = {"session_id": sid, "request_id": request_id, "role": "user", "content": "Revenue?"}
            ok(request("POST", "/rest/v1/chat_messages", question, alice))
            answer = {**question, "role": "assistant", "content": "Original answer",
                      "sources": [{"chunk": 0, "source": "test.txt", "text": "Original excerpt"}],
                      "suggestions": ["Margins?"], "provider": "test", "model": "test-model"}
            ok(request("POST", "/rest/v1/chat_messages", answer, alice))
            ok(request("POST", "/rest/v1/chat_messages?on_conflict=session_id,request_id,role",
                       {**answer, "content": "must not overwrite"}, alice,
                       prefer="resolution=ignore-duplicates,return=representation"))
            rows = ok(request("GET", f"/rest/v1/chat_messages?session_id=eq.{sid}&select=*", token=alice))
            assert len(rows) == 2
            saved = next(row for row in rows if row["role"] == "assistant")
            assert saved["content"] == answer["content"] and saved["sources"] == answer["sources"]
            assert saved["suggestions"] == answer["suggestions"] and saved["model"] == "test-model"
            for token, own, hidden in ((alice, sid, other), (bob, other, sid)):
                rows = ok(request("GET", "/rest/v1/chat_sessions?select=*", token=token))
                assert {row["id"] for row in rows} == {own}
                assert ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{hidden}&select=*", token=token)) == []
            assert ok(request("GET", "/rest/v1/chat_messages?select=*", token=bob)) == []
            assert ok(request("GET", f"/rest/v1/chat_messages?session_id=eq.{sid}&select=*", token=bob)) == []
            denied(request("POST", "/rest/v1/chat_sessions", {"user_id": users[1], "dashboard_key": "preloaded:1",
                           "dashboard_id": "1", "title": "spoof"}, alice))
            denied(request("POST", "/rest/v1/chat_messages", {**question, "request_id": str(uuid4())}, bob))
            denied(request("PATCH", f"/rest/v1/chat_sessions?id=eq.{sid}", {"user_id": users[1]}, alice))
            denied(request("PATCH", f"/rest/v1/chat_sessions?id=eq.{sid}", {"dashboard_id": "2"}, alice))
            for token in (alice, bob):
                denied(request("PATCH", f"/rest/v1/chat_messages?session_id=eq.{sid}", {"content": "tampered"}, token))
                denied(request("DELETE", f"/rest/v1/chat_messages?session_id=eq.{sid}", token=token))
            assert ok(request("PATCH", f"/rest/v1/chat_sessions?id=eq.{sid}", {"title": "attack"}, bob)) == []
            assert ok(request("DELETE", f"/rest/v1/chat_sessions?id=eq.{sid}", token=bob)) == []
            before = ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{sid}&select=*", token=alice))[0]
            assert before["title"] == "RLS integration fixture"
            changed = ok(request("PATCH", f"/rest/v1/chat_sessions?id=eq.{sid}", {
                "title": "Renamed", "updated_at": "1900-01-01T00:00:00Z",
            }, alice))[0]
            # Direct UPDATEs never move a chat in the list (rename, same title, explicit updated_at)
            assert changed["title"] == "Renamed" and changed["updated_at"] == before["updated_at"]
            for patch in ({"title": "Renamed"}, {"updated_at": "2999-01-01T00:00:00Z"}):
                assert ok(request("PATCH", f"/rest/v1/chat_sessions?id=eq.{sid}", patch, alice))[0]["updated_at"] \
                    == before["updated_at"], patch
            # A new message does, sent exactly as the backend saves one (upsert, ignore duplicates)
            ok(request("POST", "/rest/v1/chat_messages?on_conflict=session_id,request_id,role",
                       {**question, "request_id": str(uuid4())}, alice,
                       prefer="resolution=ignore-duplicates,return=representation"))
            after = ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{sid}&select=updated_at", token=alice))[0]
            assert when(after["updated_at"]) > when(before["updated_at"])
            # Question then answer in one transaction (one bulk request) keep that order; the answer's
            # smaller id would sort it first if both got the transaction's now()
            pair = str(uuid4())
            ok(request("POST", "/rest/v1/chat_messages", [
                {**question, "id": "ffffffff-0000-4000-8000-000000000000", "request_id": pair},
                {**question, "id": "00000000-0000-4000-8000-000000000000", "request_id": pair,
                 "role": "assistant", "content": "Ordered answer"},
            ], alice))
            ordered = ok(request("GET", f"/rest/v1/chat_messages?request_id=eq.{pair}&select=role&order=created_at,id",
                                 token=alice))
            assert [row["role"] for row in ordered] == ["user", "assistant"]
            # Blank text and size caps are CHECK violations; nothing is stored
            caps = str(uuid4())
            ok(request("POST", "/rest/v1/chat_messages", {**question, "request_id": caps}, alice))
            answer_at = {**question, "request_id": caps, "role": "assistant"}
            for label, body, path in [
                ("blank question", {**question, "request_id": str(uuid4()), "content": " \t\n "}, "chat_messages"),
                ("blank title", {"dashboard_key": "preloaded:1", "dashboard_id": "1", "title": " \t "}, "chat_sessions"),
                ("101-char title", {"dashboard_key": "preloaded:1", "dashboard_id": "1", "title": "t" * 101}, "chat_sessions"),
                ("oversized answer", {**answer_at, "content": "a" * 50001}, "chat_messages"),
                ("oversized sources", {**answer_at, "content": "ok", "sources": ["s" * 65533]}, "chat_messages"),
                ("oversized suggestions", {**answer_at, "content": "ok", "suggestions": ["s" * 16381]}, "chat_messages"),
            ]:
                rejected = request("POST", f"/rest/v1/{path}", body, alice)
                assert rejected.status_code == 400 and rejected.json().get("code") == "23514", label
            assert len(ok(request("GET", f"/rest/v1/chat_messages?request_id=eq.{caps}&select=id", token=alice))) == 1
            ok(request("POST", "/rest/v1/chat_messages", {**answer_at, "content": "a" * 50000,
                       "sources": ["s" * 65532], "suggestions": ["s" * 16380]}, alice))  # exactly at each cap
            for table in ("chat_sessions", "chat_messages"):
                denied(request("GET", f"/rest/v1/{table}?select=*"))
                # Filtered: an unfiltered DELETE is rejected (400) before privileges are checked
                denied(request("DELETE", f"/rest/v1/{table}?id=not.is.null"))
            denied(request("POST", "/rest/v1/chat_messages", question))
            denied(request("POST", "/rest/v1/chat_sessions", {"dashboard_key": "preloaded:1", "dashboard_id": "1", "title": "anon"}))
            # First send of a new chat: chat and question together, or nothing
            started = str(uuid4())
            start = {"p_session_id": started, "p_dashboard_key": "preloaded:1", "p_dashboard_id": "1",
                     "p_video_identifier": None, "p_title": "Started", "p_request_id": str(uuid4()), "p_content": "First?"}
            ok(request("POST", "/rest/v1/rpc/chat_start", start, alice))
            chat = lambda: ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{started}&select=title", token=alice))
            started_messages = lambda: ok(request("GET", f"/rest/v1/chat_messages?session_id=eq.{started}&select=role", token=alice))
            assert chat() == [{"title": "Started"}] and started_messages() == [{"role": "user"}]
            stamps = ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{started}&select=created_at,updated_at", token=alice))[0]
            assert when(stamps["updated_at"]) > when(stamps["created_at"]), "chat_start bumps via the message trigger"
            assert request("POST", "/rest/v1/rpc/chat_start", {**start, "p_title": "Bob claims"}, bob).status_code == 409
            assert chat() == [{"title": "Started"}] and started_messages() == [{"role": "user"}]
            empty = str(uuid4())
            assert not request("POST", "/rest/v1/rpc/chat_start", {**start, "p_session_id": empty, "p_content": " "}, alice).is_success
            assert ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{empty}&select=id", token=alice)) == []
            denied(request("POST", "/rest/v1/rpc/chat_start", {**start, "p_session_id": str(uuid4())}))
            ok(request("DELETE", f"/rest/v1/chat_sessions?id=eq.{sid}", token=alice))
            assert ok(request("GET", f"/rest/v1/chat_messages?session_id=eq.{sid}&select=*", token=alice)) == []
            # Admin is used only for fixture lifecycle and observing account-deletion cascades.
            ok(request("POST", "/rest/v1/chat_messages", {**question, "session_id": other}, bob))
            ok(request("DELETE", f"/auth/v1/admin/users/{users[1]}", admin=True))
            users.pop()
            assert ok(request("GET", f"/rest/v1/chat_sessions?id=eq.{other}&select=*", admin=True)) == []
            assert ok(request("GET", f"/rest/v1/chat_messages?session_id=eq.{other}&select=*", admin=True)) == []
            print("PASS: real Supabase REST ownership, spoofing, anonymous denial, append-only messages, retry deduplication, metadata, timestamps and cascades")
        finally:
            for user_id in users:
                response = request("DELETE", f"/auth/v1/admin/users/{user_id}", admin=True)
                if not response.is_success:
                    print("Test-user cleanup failed; remove remaining chat-rls-* users in the disposable project")


if __name__ == "__main__":
    main()
