"""Who may start a dashboard job, and which write mode the job gets."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import create_dashboard_endpoint as endpoint

ADMIN = "11111111-1111-1111-1111-111111111111"
REAL_EXISTING_ANALYSIS = endpoint._existing_analysis
COMPLETE = {"transcript_filename": "t.txt", "relevance_filename": "r.csv", "specificity_filename": "s.csv"}
INCOMPLETE = {"transcript_filename": "t.txt", "relevance_filename": None, "specificity_filename": None}
URL = {"youtube_url": "https://youtube.com/watch?v=abc"}
SIGNED_IN = {"Authorization": "Bearer good-token"}


class FakeSupabase:
    def __init__(self):
        self.inserted = []

        def get_user(token):
            if token != "good-token":
                raise RuntimeError("bad jwt")
            return SimpleNamespace(user=SimpleNamespace(id=ADMIN, email="admin@example.com"))

        self.auth = SimpleNamespace(get_user=get_user)

    def table(self, name):
        sb = self

        class Insert:
            def __init__(self, row):
                self.row = row

            def execute(self):
                sb.inserted.append((name, self.row))
                return SimpleNamespace(data=[self.row])

        return SimpleNamespace(insert=lambda row: Insert(dict(row)))


@pytest.fixture
def app_client(monkeypatch):
    sb = FakeSupabase()
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: sb)
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: None)
    monkeypatch.setattr(endpoint, "jobs", {})
    monkeypatch.delenv("YOUTUBE_HOME_WORKER", raising=False)
    monkeypatch.delenv("DASHBOARD_ADMIN_EMAILS", raising=False)
    monkeypatch.delenv("DASHBOARD_ADMIN_USER_IDS", raising=False)
    started = []
    monkeypatch.setattr(endpoint, "run_dashboard_creation", lambda *args: started.append(args))
    app = FastAPI()
    app.include_router(endpoint.router, prefix="/dashboard")
    return TestClient(app), sb, started


def post(client, body=URL, headers=None):
    return client.post("/dashboard/create-dashboard", json=body, headers=headers or {})


@pytest.mark.parametrize("row, body, headers, status, mode", [
    (None, URL, {}, 200, "safe"),                                   # new video: anyone, safe job
    (None, {**URL, "force": True}, {}, 200, "safe"),                # force on nothing is just a create
    (COMPLETE, URL, {}, 200, None),                                 # exists: returned, no job
    (INCOMPLETE, URL, {}, 200, "safe"),                             # anyone may retry an incomplete one
    (INCOMPLETE, {**URL, "force": True}, {}, 200, "safe"),          # still only a repair
    (COMPLETE, {**URL, "force": True}, {}, 401, None),              # replacing needs sign-in...
    (COMPLETE, {**URL, "force": True}, SIGNED_IN, 403, None),       # ...as an admin
])
def test_jobs_never_replace_a_complete_dashboard_without_an_admin(app_client, monkeypatch, row, body, headers, status, mode):
    client, _, started = app_client
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: row)

    res = post(client, body, headers)

    assert res.status_code == status, res.json()
    assert [args[3] for args in started] == ([mode] if mode else [])


@pytest.mark.parametrize("env", [("DASHBOARD_ADMIN_EMAILS", "Admin@Example.com"), ("DASHBOARD_ADMIN_USER_IDS", ADMIN)])
def test_admin_can_force_reprocess(app_client, monkeypatch, env):
    client, _, started = app_client
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: COMPLETE)
    monkeypatch.setenv(*env)

    assert post(client, {**URL, "force": True}, SIGNED_IN).status_code == 200
    assert started[0][3] == "force"


def test_invalid_token_is_rejected(app_client):
    client, _, started = app_client
    assert post(client, URL, {"Authorization": "Bearer forged"}).status_code == 401 and started == []


def test_home_worker_queues_plain_jobs_and_refuses_force(app_client, monkeypatch):
    client, sb, _ = app_client
    monkeypatch.setenv("YOUTUBE_HOME_WORKER", "1")
    monkeypatch.setenv("DASHBOARD_ADMIN_EMAILS", "admin@example.com")

    assert post(client).status_code == 200
    (table, row), = sb.inserted
    assert table == "youtube_jobs" and set(row) == {"id", "youtube_url", "ticker", "status"}

    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: COMPLETE)
    assert post(client, {**URL, "force": True}, SIGNED_IN).status_code == 409
    assert len(sb.inserted) == 1


def test_lookup_failure_fails_closed(app_client, monkeypatch):
    client, _, started = app_client

    class Broken:
        def table(self, _):
            raise RuntimeError("supabase down")

    monkeypatch.setattr(endpoint, "_existing_analysis", REAL_EXISTING_ANALYSIS)
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: Broken())

    assert post(client, {**URL, "force": True}).status_code == 503 and started == []


@pytest.mark.parametrize("mode", ["safe", "force"])
def test_pipeline_passes_write_mode_to_script(monkeypatch, mode):
    calls = []
    monkeypatch.setattr(endpoint.subprocess, "run",
                        lambda cmd, **kw: calls.append(cmd) or SimpleNamespace(returncode=0, stdout="", stderr=""))
    endpoint.jobs["j"] = {"status": "pending"}
    endpoint.run_dashboard_creation("j", "https://youtube.com/watch?v=abc", "AAPL", mode)
    assert calls[0][-4:] == ["--ticker", "AAPL", "--write-mode", mode]


def test_home_worker_always_runs_safe_jobs(monkeypatch):
    import importlib.util

    from conftest import RAG_DIR

    spec = importlib.util.spec_from_file_location("home_youtube_worker", RAG_DIR.parent / "scripts" / "home_youtube_worker.py")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    calls = []
    monkeypatch.setattr(worker.subprocess, "run",
                        lambda cmd, **kw: calls.append(cmd) or SimpleNamespace(returncode=0, stdout="", stderr=""))

    worker.run_pipeline("https://youtube.com/watch?v=abc", None)

    assert calls[0][-2:] == ["--write-mode", "safe"]
