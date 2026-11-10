"""The home worker always records how a job ended; nothing stays "running" forever."""

import importlib.util
import subprocess
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from conftest import RAG_DIR

JOB = {"id": "job-1", "youtube_url": "https://youtu.be/vid123", "ticker": None, "status": "pending"}


def load_worker():
    spec = importlib.util.spec_from_file_location("home_youtube_worker", RAG_DIR.parent / "scripts" / "home_youtube_worker.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


WORKER = load_worker()


class Jobs:
    """youtube_jobs with the select / update / eq / lt / order / limit calls the worker makes."""

    def __init__(self, rows, failing_writes=0):
        self.rows = {r["id"]: dict(r) for r in rows}
        self.failing_writes = failing_writes

    def table(self, _name):
        store = self

        class Query:
            def __init__(self):
                self.filters, self.payload = [], None

            def select(self, _columns):
                return self

            def update(self, payload):
                self.payload = payload
                return self

            def eq(self, column, value):
                self.filters.append(lambda r: r.get(column) == value)
                return self

            def lt(self, column, value):
                self.filters.append(lambda r: r.get(column) < value)
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, _n):
                return self

            def execute(self):
                matched = [r for r in store.rows.values() if all(f(r) for f in self.filters)]
                if self.payload is not None:
                    if store.failing_writes and self.payload.get("status") != "running":
                        store.failing_writes -= 1
                        raise RuntimeError("supabase write failed")
                    for r in matched:
                        r.update(self.payload)
                return SimpleNamespace(data=matched)

        return Query()


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch):
    monkeypatch.setattr(WORKER.time, "sleep", lambda _s: None)


def run_with(monkeypatch, outcome):
    def fake_run(cmd, **kwargs):
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(WORKER.subprocess, "run", fake_run)


@pytest.mark.parametrize("outcome, error", [
    (subprocess.TimeoutExpired(cmd="x", timeout=7200), "Processing timeout"),
    (OSError("python not found"), "python not found"),
])
def test_a_pipeline_that_cannot_finish_marks_the_job_failed(monkeypatch, outcome, error):
    jobs = Jobs([JOB])
    run_with(monkeypatch, outcome)

    assert WORKER.process_one(jobs)

    row = jobs.rows["job-1"]
    assert row["status"] == "failed" and error in row["error"] and row["video_id"] == "vid123"


def test_job_error_is_the_tail_of_the_output(monkeypatch):
    jobs = Jobs([JOB])
    banner = "🚀 Starting Dashboard Creation Pipeline\n" + "progress\n" * 500
    run_with(monkeypatch, SimpleNamespace(returncode=1, stdout=banner + "❌ Sentiment analysis failed (relevance).", stderr=""))

    WORKER.process_one(jobs)

    assert jobs.rows["job-1"]["error"].endswith("❌ Sentiment analysis failed (relevance).")


def test_a_failed_status_write_is_retried(monkeypatch):
    jobs = Jobs([JOB], failing_writes=2)
    run_with(monkeypatch, SimpleNamespace(returncode=0, stdout="ok", stderr=""))

    WORKER.process_one(jobs)

    assert jobs.rows["job-1"]["status"] == "completed"


def test_stale_running_jobs_are_failed_and_recent_ones_left_alone():
    now = datetime.now(timezone.utc)
    jobs = Jobs([
        {**JOB, "id": "stale", "status": "running", "created_at": (now - timedelta(hours=3)).isoformat()},
        {**JOB, "id": "recent", "status": "running", "created_at": (now - timedelta(minutes=5)).isoformat()},
        {**JOB, "id": "old-done", "status": "completed", "created_at": (now - timedelta(days=2)).isoformat()},
    ])

    WORKER.fail_stale_jobs(jobs)

    assert jobs.rows["stale"]["status"] == "failed"
    assert jobs.rows["recent"]["status"] == "running"
    assert jobs.rows["old-done"]["status"] == "completed"


def test_stale_sweep_errors_do_not_stop_the_worker():
    class Down:
        def table(self, _name):
            raise RuntimeError("supabase down")

    WORKER.fail_stale_jobs(Down())  # logs and returns
