"""The pipeline's final write never replaces a complete analysis unless an admin forced it."""

import importlib.util
from types import SimpleNamespace

import pytest

from conftest import RAG_DIR

FILES = {"relevance_filename": "r.csv", "specificity_filename": "s.csv"}
META = {"title": "t", "ticker": "AAPL", "upload_date": "20250101"}
COMPLETE = {"video_identifier": "vid", "transcript_filename": "done.txt",
            "relevance_filename": "done-r.csv", "specificity_filename": "done-s.csv"}
INCOMPLETE = {"video_identifier": "vid", "transcript_filename": "half.txt",
              "relevance_filename": None, "specificity_filename": None}


class RowStore:
    """video_analyses keyed by video_identifier, with Postgres' unique key and filtered UPDATE."""

    def __init__(self, rows=None, missing_columns=()):
        self.rows = {r["video_identifier"]: dict(r) for r in (rows or [])}
        self.missing_columns = set(missing_columns)
        self.removed = []
        store = self

        class Bucket:
            def __init__(self, name):
                self.name = name

            def remove(self, names):
                store.removed.extend(f"{self.name}/{n}" for n in names)

        self.storage = SimpleNamespace(from_=Bucket)

    def table(self, _name):
        return Query(self)


class Query:
    def __init__(self, store):
        self.store, self.op, self.data, self.filters = store, None, None, []

    def insert(self, data):
        self.op, self.data = "insert", dict(data)
        return self

    def upsert(self, data, on_conflict=None):
        self.op, self.data = "upsert", dict(data)
        return self

    def update(self, data):
        self.op, self.data = "update", dict(data)
        return self

    def eq(self, column, value):
        self.filters.append(lambda row: row.get(column) == value)
        return self

    def or_(self, expression):
        # Only the "<column>.is.null,..." form used by the script
        columns = [part.split(".is.null")[0] for part in expression.split(",")]
        self.filters.append(lambda row: any(row.get(c) is None for c in columns))
        return self

    def execute(self):
        for column in self.store.missing_columns & set(self.data):
            raise RuntimeError(f"column video_analyses.{column} does not exist")
        rows, key = self.store.rows, self.data.get("video_identifier")
        if self.op == "insert":
            if key in rows:
                raise RuntimeError("duplicate key value violates unique constraint (code 23505)")
            rows[key] = dict(self.data)
            return SimpleNamespace(data=[rows[key]])
        if self.op == "upsert":
            rows.setdefault(key, {}).update(self.data)
            return SimpleNamespace(data=[rows[key]])
        matched = [r for r in rows.values() if all(f(r) for f in self.filters)]
        for r in matched:
            r.update(self.data)
        return SimpleNamespace(data=matched)


def load_script():
    path = RAG_DIR.parent / "scripts" / "create_dashboard_from_youtube.py"
    spec = importlib.util.spec_from_file_location("create_dashboard_from_youtube", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT = load_script()


def write(store, transcript, mode):
    creator = object.__new__(SCRIPT.DashboardCreator)
    creator.supabase = store
    return creator.create_database_entry("vid", META, transcript, FILES, write_mode=mode)


def test_two_jobs_for_the_same_new_video_cannot_overwrite_each_other():
    store = RowStore()

    assert write(store, "first.txt", "safe")
    assert not write(store, "second.txt", "safe")

    assert store.rows["vid"]["transcript_filename"] == "first.txt"
    assert store.removed == ["transcripts/second.txt", "sentiment/r.csv", "sentiment/s.csv"]


def test_safe_job_repairs_an_incomplete_dashboard():
    store = RowStore([INCOMPLETE])

    assert write(store, "fixed.txt", "safe")

    assert store.rows["vid"]["transcript_filename"] == "fixed.txt" and store.removed == []


def test_safe_job_never_replaces_a_complete_dashboard():
    store = RowStore([COMPLETE])

    assert not write(store, "new.txt", "safe")

    assert store.rows["vid"] == COMPLETE
    assert "transcripts/new.txt" in store.removed


def test_concurrent_repairs_only_the_first_lands():
    store = RowStore([INCOMPLETE])

    assert write(store, "repair-a.txt", "safe")
    assert not write(store, "repair-b.txt", "safe")  # row is complete now

    assert store.rows["vid"]["transcript_filename"] == "repair-a.txt"


def test_force_replaces_a_complete_dashboard():
    store = RowStore([COMPLETE])

    assert write(store, "new.txt", "force")

    assert store.rows["vid"]["transcript_filename"] == "new.txt"


def test_force_fails_if_the_dashboard_was_deleted_meanwhile():
    store = RowStore()

    assert not write(store, "new.txt", "force")

    assert store.rows == {} and "transcripts/new.txt" in store.removed


def test_manual_run_without_mode_upserts():
    store = RowStore([COMPLETE])

    assert write(store, "manual.txt", None)

    assert store.rows["vid"]["transcript_filename"] == "manual.txt"


def test_missing_metadata_column_still_saves():
    store = RowStore(missing_columns={"metadata"})

    assert write(store, "a.txt", "safe")

    assert "metadata" not in store.rows["vid"]


@pytest.mark.parametrize("bad", ["new", "replace", ""])
def test_cli_rejects_unknown_write_modes(monkeypatch, bad):
    monkeypatch.setattr("sys.argv", ["create_dashboard_from_youtube.py", "https://youtube.com/watch?v=abc", "--write-mode", bad])
    with pytest.raises(SystemExit) as exit_info:
        SCRIPT.main()
    assert exit_info.value.code == 2
