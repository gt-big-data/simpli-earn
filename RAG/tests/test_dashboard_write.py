"""The pipeline's final write enforces, atomically, the ownership the API authorized at request time."""

import importlib.util
from types import SimpleNamespace

import pytest

from conftest import RAG_DIR

ALICE = "11111111-1111-1111-1111-111111111111"
BOB = "22222222-2222-2222-2222-222222222222"
FILES = {"relevance_filename": "r.csv", "specificity_filename": "s.csv"}
META = {"title": "t", "ticker": "AAPL", "upload_date": "20250101"}


class RowStore:
    """video_analyses keyed by video_identifier, with the unique key and filtered UPDATE of Postgres."""

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
        self.filters.append((column, value))
        return self

    def is_(self, column, value):
        self.filters.append((column, None))
        return self

    def execute(self):
        used = set(self.data) | {c for c, _ in self.filters}
        for column in self.store.missing_columns & used:
            raise RuntimeError(f"column video_analyses.{column} does not exist")
        rows, key = self.store.rows, self.data.get("video_identifier")
        if self.op == "insert":
            if key in rows:
                raise RuntimeError('duplicate key value violates unique constraint (code 23505)')
            rows[key] = dict(self.data)
            return SimpleNamespace(data=[rows[key]])
        if self.op == "upsert":
            rows.setdefault(key, {}).update(self.data)
            return SimpleNamespace(data=[rows[key]])
        matched = [r for r in rows.values() if all(r.get(c) == v for c, v in self.filters)]
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


def write(store, transcript, created_by, expect_owner):
    creator = object.__new__(SCRIPT.DashboardCreator)
    creator.supabase = store
    return creator.create_database_entry("vid", META, transcript, FILES, created_by=created_by, expect_owner=expect_owner)


def test_two_jobs_for_the_same_new_video_cannot_overwrite_each_other():
    """Both were authorized when no row existed; whichever writes second must not replace the first."""
    store = RowStore()

    assert write(store, "alice.txt", ALICE, "new")
    assert not write(store, "bob.txt", BOB, "new")

    assert store.rows["vid"]["transcript_filename"] == "alice.txt"
    assert store.rows["vid"]["created_by"] == ALICE
    assert store.removed == ["transcripts/bob.txt", "sentiment/r.csv", "sentiment/s.csv"]


def test_owner_reprocess_updates_without_changing_owner():
    store = RowStore([{"video_identifier": "vid", "created_by": ALICE, "transcript_filename": "old.txt"}])

    assert write(store, "new.txt", ALICE, ALICE)

    assert store.rows["vid"] == {**store.rows["vid"], "transcript_filename": "new.txt", "created_by": ALICE}
    assert store.removed == []


@pytest.mark.parametrize("current_owner, expect_owner", [
    (BOB, ALICE),    # ownership differs from what was authorized
    (ALICE, "none"),  # was ownerless when an admin queued it, claimed by a new row since
])
def test_reprocess_is_refused_if_ownership_changed(current_owner, expect_owner):
    store = RowStore([{"video_identifier": "vid", "created_by": current_owner, "transcript_filename": "keep.txt"}])

    assert not write(store, "new.txt", ALICE, expect_owner)

    assert store.rows["vid"]["transcript_filename"] == "keep.txt"
    assert "transcripts/new.txt" in store.removed


def test_reprocess_is_refused_if_row_was_deleted():
    assert not write(RowStore(), "new.txt", ALICE, ALICE)


def test_admin_reprocess_of_ownerless_row_never_claims_it():
    store = RowStore([{"video_identifier": "vid", "created_by": None, "transcript_filename": "old.txt"}])

    assert write(store, "new.txt", ALICE, "none")

    assert store.rows["vid"]["transcript_filename"] == "new.txt"
    assert store.rows["vid"]["created_by"] is None


def test_manual_run_without_expectation_upserts():
    store = RowStore([{"video_identifier": "vid", "created_by": BOB, "transcript_filename": "old.txt"}])

    assert write(store, "new.txt", None, None)

    assert store.rows["vid"]["transcript_filename"] == "new.txt" and store.rows["vid"]["created_by"] == BOB


def test_without_migration_004_new_rows_are_inserted_without_owner():
    store = RowStore(missing_columns={"created_by"})

    assert write(store, "a.txt", ALICE, "new")
    assert not write(store, "b.txt", BOB, "new")  # unique key still protects the first job

    assert "created_by" not in store.rows["vid"] and store.rows["vid"]["transcript_filename"] == "a.txt"


def test_without_migration_004_ownerless_reprocess_updates():
    store = RowStore([{"video_identifier": "vid", "transcript_filename": "old.txt"}], missing_columns={"created_by"})

    assert write(store, "new.txt", ALICE, "none")

    assert store.rows["vid"]["transcript_filename"] == "new.txt"
