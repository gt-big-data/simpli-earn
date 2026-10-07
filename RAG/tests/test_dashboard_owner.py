"""The signed-in user who requests a dashboard is recorded as its owner, and ownership never transfers."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import create_dashboard_endpoint as endpoint


USER = "11111111-1111-1111-1111-111111111111"
REAL_EXISTING_ANALYSIS = endpoint._existing_analysis


class FakeTable:
    def __init__(self, sb, name):
        self.sb, self.name, self.payload, self.filters = sb, name, None, {}

    def insert(self, payload):
        self.payload = ("insert", payload)
        return self

    def upsert(self, payload, on_conflict=None):
        self.payload = ("upsert", payload)
        return self

    def select(self, *_):
        return self

    def eq(self, col, value):
        self.filters[col] = value
        return self

    def limit(self, _):
        return self

    def execute(self):
        if self.payload:
            kind, data = self.payload
            for column in self.sb.missing_columns:
                if column in data:
                    raise RuntimeError(f"Could not find the '{column}' column")
            self.sb.writes.append((self.name, kind, dict(data)))
            return SimpleNamespace(data=[data])
        return SimpleNamespace(data=self.sb.existing)


class FakeSupabase:
    def __init__(self, existing=None, missing_columns=()):
        self.existing = existing or []
        self.missing_columns = list(missing_columns)
        self.writes = []

        def get_user(token):
            if token != "good-token":
                raise RuntimeError("bad jwt")
            return SimpleNamespace(user=SimpleNamespace(id=USER, email="user@example.com"))

        self.auth = SimpleNamespace(get_user=get_user)

    def table(self, name):
        return FakeTable(self, name)


@pytest.fixture
def app_client(monkeypatch):
    sb = FakeSupabase()
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: sb)
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: None)
    monkeypatch.setattr(endpoint, "jobs", {})
    started = []
    monkeypatch.setattr(endpoint, "run_dashboard_creation", lambda *args: started.append(args))
    app = FastAPI()
    app.include_router(endpoint.router, prefix="/dashboard")
    return TestClient(app), sb, started


def test_signed_in_request_passes_owner_to_pipeline(app_client):
    client, _, started = app_client
    res = client.post("/dashboard/create-dashboard", json={"youtube_url": "https://youtube.com/watch?v=abc"},
                      headers={"Authorization": "Bearer good-token"})
    assert res.status_code == 200
    assert started[0][1:] == ("https://youtube.com/watch?v=abc", None, USER, "new")


def test_anonymous_request_has_no_owner(app_client):
    client, _, started = app_client
    client.post("/dashboard/create-dashboard", json={"youtube_url": "https://youtube.com/watch?v=abc"})
    assert started[0][3] is None


def test_invalid_token_is_rejected(app_client):
    client, _, started = app_client
    res = client.post("/dashboard/create-dashboard", json={"youtube_url": "https://youtube.com/watch?v=abc"},
                      headers={"Authorization": "Bearer forged"})
    assert res.status_code == 401 and started == []


@pytest.mark.parametrize("missing_columns, expect_owner", [
    ((), True), (("created_by",), False), (("expected_owner",), True), (("created_by", "expected_owner"), False),
])
def test_home_worker_queue_records_owner(app_client, monkeypatch, missing_columns, expect_owner):
    client, sb, _ = app_client
    sb.missing_columns = list(missing_columns)
    monkeypatch.setenv("YOUTUBE_HOME_WORKER", "1")
    res = client.post("/dashboard/create-dashboard", json={"youtube_url": "https://youtube.com/watch?v=abc"},
                      headers={"Authorization": "Bearer good-token"})
    assert res.status_code == 200
    (table, kind, row), = sb.writes
    assert (table, kind) == ("youtube_jobs", "insert")
    assert (row.get("created_by") == USER) is expect_owner
    assert row.get("expected_owner") == (None if "expected_owner" in missing_columns else "new")


def test_pipeline_passes_owner_to_script(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(endpoint.subprocess, "run", lambda cmd, **kw: calls.append(cmd) or SimpleNamespace(returncode=0, stdout="", stderr=""))
    endpoint.jobs["j"] = {"status": "pending"}
    endpoint.run_dashboard_creation("j", "https://youtube.com/watch?v=abc", "AAPL", USER, USER)
    assert calls[0][-6:] == ["--ticker", "AAPL", "--created-by", USER, "--expect-owner", USER]


OTHER = "22222222-2222-2222-2222-222222222222"
COMPLETE = {"transcript_filename": "t.txt", "relevance_filename": "r.csv", "specificity_filename": "s.csv"}
URL = {"youtube_url": "https://youtube.com/watch?v=abc"}
SIGNED_IN = {"Authorization": "Bearer good-token"}


@pytest.mark.parametrize("row, body, headers, status", [
    (None, URL, {}, 200),                                                       # new video: anyone
    ({**COMPLETE, "created_by": OTHER}, URL, {}, 200),                          # exists: returned as-is
    ({**COMPLETE, "created_by": OTHER}, {**URL, "force": True}, {}, 401),       # force needs sign-in
    ({**COMPLETE, "created_by": OTHER}, {**URL, "force": True}, SIGNED_IN, 403),  # ...by the owner
    ({**COMPLETE, "created_by": USER}, {**URL, "force": True}, SIGNED_IN, 200),
    ({"transcript_filename": "t.txt", "created_by": OTHER}, URL, SIGNED_IN, 403),  # incomplete retry overwrites too
    ({"transcript_filename": "t.txt", "created_by": None}, URL, SIGNED_IN, 403),   # ownerless: admin only
])
def test_reprocessing_requires_owner(app_client, monkeypatch, row, body, headers, status):
    client, _, started = app_client
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: row)

    res = client.post("/dashboard/create-dashboard", json=body, headers=headers)

    assert res.status_code == status, res.json()
    reprocessing = row is not None and (body.get("force") or not all(row.get(k) for k in COMPLETE))
    assert bool(started) == (status == 200 and (row is None or reprocessing))


def test_admin_can_reprocess_any_dashboard(app_client, monkeypatch):
    client, _, started = app_client
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: {**COMPLETE, "created_by": None})
    monkeypatch.setenv("LIBRARY_ADMIN_EMAILS", "User@Example.com")

    res = client.post("/dashboard/create-dashboard", json={**URL, "force": True}, headers=SIGNED_IN)

    assert res.status_code == 200 and started


def test_owner_check_fails_closed_when_lookup_errors(app_client, monkeypatch):
    client, _, started = app_client

    class Broken:
        def table(self, _):
            raise RuntimeError("supabase down")

    monkeypatch.setattr(endpoint, "_existing_analysis", REAL_EXISTING_ANALYSIS)
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: Broken())

    res = client.post("/dashboard/create-dashboard", json={**URL, "force": True})

    assert res.status_code == 503 and started == []


def test_existing_analysis_without_migration_004_is_ownerless(monkeypatch):
    calls = []

    class Query:
        def __init__(self, columns):
            self.columns = columns

        def eq(self, *_):
            return self

        def limit(self, _):
            return self

        def execute(self):
            calls.append(self.columns)
            if "created_by" in self.columns:
                raise RuntimeError("column video_analyses.created_by does not exist")
            return SimpleNamespace(data=[dict(COMPLETE)])

    sb = SimpleNamespace(table=lambda _: SimpleNamespace(select=lambda cols: Query(cols)))
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: sb)

    row = endpoint._existing_analysis("abc")

    assert row == COMPLETE and "created_by" not in row
    assert not endpoint._can_reprocess(SimpleNamespace(id=USER, email=None), row)


@pytest.mark.parametrize("row, expected", [
    (None, "new"),
    ({**COMPLETE, "created_by": USER}, USER),
    ({**COMPLETE, "created_by": None}, "none"),
])
def test_job_carries_the_ownership_it_was_authorized_against(app_client, monkeypatch, row, expected):
    client, _, started = app_client
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: row)
    monkeypatch.setenv("LIBRARY_ADMIN_EMAILS", "user@example.com")  # lets the ownerless case through

    client.post("/dashboard/create-dashboard", json={**URL, "force": True}, headers=SIGNED_IN)

    assert started[0][4] == expected
