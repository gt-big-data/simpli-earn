"""POST /summary works whether or not video_analyses has the summary column (migration 003)."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from conftest import FakeGeminiChat

TRANSCRIPT = "Apple revenue grew 12 percent. Services hit a record."
URL = "https://www.youtube.com/watch?v=abc123"


class FakeSupabase:
    def __init__(self, has_summary_column, saved=None):
        self.has_summary_column = has_summary_column
        self.saved = saved
        self.selects, self.updates = [], []
        sb = self

        class Query:
            def __init__(self):
                self.columns, self.payload = None, None

            def select(self, columns):
                self.columns = columns
                return self

            def update(self, payload):
                self.payload = payload
                return self

            def eq(self, *_):
                return self

            def execute(self):
                if self.payload is not None:
                    if "summary" in self.payload and not sb.has_summary_column:
                        raise RuntimeError("column video_analyses.summary does not exist")
                    sb.updates.append(self.payload)
                    return SimpleNamespace(data=[])
                sb.selects.append(self.columns)
                if "summary" in self.columns and not sb.has_summary_column:
                    raise RuntimeError("column video_analyses.summary does not exist")
                row = {"transcript_filename": "abc_transcript.txt"}
                if sb.has_summary_column:
                    row["summary"] = sb.saved
                return SimpleNamespace(data=[row])

        self.table = lambda _name: Query()
        self.storage = SimpleNamespace(from_=lambda _bucket: SimpleNamespace(
            download=lambda _name: TRANSCRIPT.encode()))


@pytest.fixture
def client(gemini_only, monkeypatch):
    import api_chatbot

    # YouTube captions unavailable: the stored transcript is the only source
    monkeypatch.setattr(api_chatbot, "get_video_transcript_entries", lambda _url: None)
    return TestClient(api_chatbot.app), api_chatbot


def summarize(client, monkeypatch, fake):
    http, api_chatbot = client
    monkeypatch.setattr(api_chatbot, "supabase", fake)
    return http.post("/summary", json={"video_url": URL}).json()


def test_without_summary_column_uses_stored_transcript_and_skips_saving(client, monkeypatch):
    fake = FakeSupabase(has_summary_column=False)

    body = summarize(client, monkeypatch, fake)

    assert "Error" not in body["summary"]
    assert any(TRANSCRIPT in prompt for prompt in FakeGeminiChat.prompts)  # stored transcript was summarized
    assert fake.selects == ["transcript_filename,summary", "transcript_filename"]
    assert fake.updates == []


def test_with_summary_column_generates_once_and_saves(client, monkeypatch):
    fake = FakeSupabase(has_summary_column=True)

    body = summarize(client, monkeypatch, fake)

    assert "Error" not in body["summary"]
    assert len(fake.updates) == 1 and fake.updates[0]["summary"]["summary"] == body["summary"]


def test_saved_summary_is_returned_from_cache(client, monkeypatch):
    saved = {"summary": "Cached summary.", "sections": [], "provider": "gemini"}
    fake = FakeSupabase(has_summary_column=True, saved=saved)

    body = summarize(client, monkeypatch, fake)

    assert body["cached"] is True and body["summary"] == "Cached summary."
