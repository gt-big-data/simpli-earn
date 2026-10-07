"""Authentication and per-record authorization for library deletes and other destructive endpoints."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import api

OWNER = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
ADMIN = "33333333-3333-3333-3333-333333333333"
TOKENS = {
    "tok-owner": SimpleNamespace(id=OWNER, email="owner@example.com"),
    "tok-other": SimpleNamespace(id=OTHER, email="other@example.com"),
    "tok-admin": SimpleNamespace(id=ADMIN, email="Admin@Example.com"),
}


def row(video, created_by):
    return {
        "id": video,
        "video_identifier": video,
        "created_by": created_by,
        "transcript_filename": f"{video}_transcript.txt",
        "relevance_filename": f"{video}_relevance.csv",
        "specificity_filename": f"{video}_specificity.csv",
        "metadata": {"title": video, "ticker": "ZZZT"},
    }


class FakeSupabase:
    def __init__(self, rows):
        self.rows = {r["video_identifier"]: r for r in rows}
        self.removed = []
        self.deleted_rows = []
        self.fail_storage = False
        outer = self

        class Auth:
            def get_user(self, token):
                if token not in TOKENS:
                    raise RuntimeError("invalid JWT")
                return SimpleNamespace(user=TOKENS[token])

        class Bucket:
            def __init__(self, name):
                self.name = name

            def remove(self, names):
                if outer.fail_storage:
                    raise RuntimeError("storage down")
                outer.removed.extend(f"{self.name}/{n}" for n in names)

        class Storage:
            def from_(self, name):
                return Bucket(name)

        self.auth = Auth()
        self.storage = Storage()

    def table(self, _name):
        outer = self

        class Query:
            def __init__(self):
                self.filter = None
                self.deleting = False

            def select(self, *_):
                return self

            def delete(self):
                self.deleting = True
                return self

            def eq(self, _col, value):
                self.filter = value
                return self

            def execute(self):
                if self.deleting:
                    outer.deleted_rows.append(self.filter)
                    outer.rows.pop(self.filter, None)
                    return SimpleNamespace(data=[])
                rows = list(outer.rows.values()) if self.filter is None else [outer.rows[self.filter]] if self.filter in outer.rows else []
                return SimpleNamespace(data=[dict(r) for r in rows])

        return Query()


@pytest.fixture
def fake(monkeypatch):
    fake = FakeSupabase([row("ownedVid", OWNER), row("legacyVid", None)])
    monkeypatch.setattr(api, "supabase", fake)
    monkeypatch.setenv("LIBRARY_ADMIN_EMAILS", "admin@example.com")
    return fake


@pytest.fixture
def client(fake):
    return TestClient(api.app)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}])
def test_delete_requires_sign_in(client, fake, headers):
    res = client.delete("/library/ownedVid", headers=headers)
    assert res.status_code == 401
    assert fake.removed == [] and fake.deleted_rows == []


def test_delete_rejects_invalid_token(client, fake):
    res = client.delete("/library/ownedVid", headers=auth("forged"))
    assert res.status_code == 401
    assert fake.removed == [] and fake.deleted_rows == []


def test_other_user_cannot_delete_or_touch_storage(client, fake):
    res = client.delete("/library/ownedVid", headers=auth("tok-other"))
    assert res.status_code == 403
    assert fake.removed == [] and fake.deleted_rows == []
    assert "ownedVid" in fake.rows


def test_owner_deletes_record_and_all_files(client, fake):
    res = client.delete("/library/ownedVid", headers=auth("tok-owner"))
    assert res.status_code == 200 and res.json()["success"] is True
    assert fake.removed == [
        "transcripts/ownedVid_transcript.txt",
        "sentiment/ownedVid_relevance.csv",
        "sentiment/ownedVid_specificity.csv",
    ]
    assert fake.deleted_rows == ["ownedVid"]


def test_unowned_legacy_rows_are_admin_only(client, fake):
    assert client.delete("/library/legacyVid", headers=auth("tok-owner")).status_code == 403
    assert client.delete("/library/legacyVid", headers=auth("tok-admin")).status_code == 200
    assert fake.deleted_rows == ["legacyVid"]


def test_admin_by_user_id(client, fake, monkeypatch):
    monkeypatch.setenv("LIBRARY_ADMIN_EMAILS", "")
    monkeypatch.setenv("LIBRARY_ADMIN_USER_IDS", f"{ADMIN}, someone-else")
    assert client.delete("/library/ownedVid", headers=auth("tok-admin")).status_code == 200


def test_missing_video_is_404_for_signed_in_user(client):
    assert client.delete("/library/nope", headers=auth("tok-owner")).status_code == 404


def test_storage_failure_keeps_record_for_retry(client, fake):
    fake.fail_storage = True
    res = client.delete("/library/ownedVid", headers=auth("tok-owner"))
    assert res.status_code == 502
    assert fake.deleted_rows == [] and "ownedVid" in fake.rows


def test_library_marks_deletable_items_and_hides_owner_ids(client):
    anonymous = client.get("/library").json()["videos"]
    owner = client.get("/library", headers=auth("tok-owner")).json()["videos"]
    admin = client.get("/library", headers=auth("tok-admin")).json()["videos"]
    forged = client.get("/library", headers=auth("forged"))

    assert {v["video_identifier"]: v["can_delete"] for v in anonymous} == {"ownedVid": False, "legacyVid": False}
    assert {v["video_identifier"]: v["can_delete"] for v in owner} == {"ownedVid": True, "legacyVid": False}
    assert {v["video_identifier"]: v["can_delete"] for v in admin} == {"ownedVid": True, "legacyVid": True}
    assert forged.status_code == 200  # a stale token never breaks the public listing
    assert all("created_by" not in v for v in anonymous + owner + admin)


@pytest.mark.parametrize("method, path", [
    ("delete", "/sentiment/ownedVid_relevance.csv"),
    ("post", "/analyze/specificity"),
    ("post", "/analyze/relevance"),
])
def test_other_destructive_endpoints_are_admin_only(client, fake, monkeypatch, method, path):
    async def no_script(*_args, **_kwargs):
        return None

    monkeypatch.setattr(api, "run_analysis_script", no_script)
    body = {"input_file": "x.txt"} if method == "post" else None
    call = lambda headers: client.request(method.upper(), path, headers=headers, json=body)

    assert call({}).status_code == 401
    assert call(auth("tok-owner")).status_code == 403
    assert fake.removed == []
    assert call(auth("tok-admin")).status_code == 200
