"""Job status survives a poll that reaches a different API instance than the one running the job."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import create_dashboard_endpoint as endpoint

URL = "https://youtube.com/watch?v=abc"


class JobsTable:
    """youtube_jobs keyed by id, with the upsert / select-by-id calls the endpoint makes."""

    def __init__(self, broken=False):
        self.rows, self.broken = {}, broken

    def table(self, name):
        assert name == "youtube_jobs"
        store = self

        class Query:
            def upsert(self, row):
                self.write = dict(row)
                return self

            def select(self, _columns):
                self.write = None
                return self

            def eq(self, _column, value):
                self.id = value
                return self

            def limit(self, _n):
                return self

            def execute(self):
                if store.broken:
                    raise RuntimeError("supabase down")
                if self.write is not None:
                    store.rows.setdefault(self.write["id"], {"created_at": "2026-11-01T00:00:00Z"}).update(self.write)
                    return SimpleNamespace(data=[self.write])
                row = store.rows.get(self.id)
                return SimpleNamespace(data=[row] if row else [])

        return Query()


@pytest.fixture
def instance(monkeypatch):
    """One API instance; switch_instance() simulates the next poll landing on another one."""
    table = JobsTable()
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: table)
    monkeypatch.setattr(endpoint, "_existing_analysis", lambda _vid: None)
    monkeypatch.setattr(endpoint, "jobs", {})
    monkeypatch.delenv("YOUTUBE_HOME_WORKER", raising=False)
    started = []
    monkeypatch.setattr(endpoint.BackgroundTasks, "add_task", lambda self, fn, *args: started.append(args))
    app = FastAPI()
    app.include_router(endpoint.router, prefix="/dashboard")
    client = TestClient(app)

    def switch_instance():
        monkeypatch.setattr(endpoint, "jobs", {})

    return SimpleNamespace(client=client, table=table, started=started, switch_instance=switch_instance)


def run_script(monkeypatch, job_id, returncode=0, stdout=""):
    monkeypatch.setattr(endpoint.subprocess, "run",
                        lambda *a, **kw: SimpleNamespace(returncode=returncode, stdout=stdout, stderr=""))
    endpoint.run_dashboard_creation(job_id, URL)


def status(instance, job_id):
    res = instance.client.get(f"/dashboard/job-status/{job_id}")
    return res.status_code, res.json()


def test_poll_on_another_instance_sees_the_job_through_to_completion(instance, monkeypatch):
    job_id = instance.client.post("/dashboard/create-dashboard", json={"youtube_url": URL}).json()["job_id"]
    running_jobs = endpoint.jobs

    instance.switch_instance()
    code, body = status(instance, job_id)
    assert code == 200 and body["status"] == "running"

    monkeypatch.setattr(endpoint, "jobs", running_jobs)  # the job finishes on its own instance
    run_script(monkeypatch, job_id)
    instance.switch_instance()

    code, body = status(instance, job_id)
    assert code == 200 and body["status"] == "completed" and body["video_id"] == "abc"


def test_failure_is_visible_from_another_instance(instance, monkeypatch):
    job_id = instance.client.post("/dashboard/create-dashboard", json={"youtube_url": URL}).json()["job_id"]
    run_script(monkeypatch, job_id, returncode=1, stdout="... ❌ Transcription failed")
    instance.switch_instance()

    code, body = status(instance, job_id)
    assert code == 200 and body["status"] == "failed" and "Transcription failed" in body["error"]


def test_in_process_jobs_are_never_left_pending_for_a_home_worker(instance, monkeypatch):
    job_id = instance.client.post("/dashboard/create-dashboard", json={"youtube_url": URL}).json()["job_id"]
    assert endpoint.jobs[job_id]["status"] == "pending"
    assert instance.table.rows[job_id]["status"] == "running"


def test_supabase_outage_does_not_break_the_job(instance, monkeypatch):
    instance.table.broken = True
    job_id = instance.client.post("/dashboard/create-dashboard", json={"youtube_url": URL}).json()["job_id"]
    run_script(monkeypatch, job_id)

    code, body = status(instance, job_id)  # same instance: memory still answers
    assert code == 200 and body["status"] == "completed"


@pytest.mark.parametrize("job_id", ["00000000-0000-0000-0000-000000000000", "not-a-uuid"])
def test_unknown_jobs_are_404(instance, job_id):
    assert status(instance, job_id)[0] == 404


def test_without_supabase_unknown_jobs_are_404(instance, monkeypatch):
    monkeypatch.setattr(endpoint, "_get_supabase", lambda: None)
    assert status(instance, "00000000-0000-0000-0000-000000000000")[0] == 404
