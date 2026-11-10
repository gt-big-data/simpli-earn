"""Chat uses the pipeline's transcript once it exists, even if the call was chatted about while processing."""

from types import SimpleNamespace

import pytest

import api_chatbot

LINKS = ["https://www.youtube.com/watch?v=vid123", "https://youtu.be/vid123?si=x", "https://www.youtube.com/live/vid123"]


class ProcessedCalls:
    """video_analyses + transcripts bucket; `finish()` is the pipeline landing its transcript."""

    def __init__(self):
        self.rows = []
        self.storage = SimpleNamespace(from_=lambda _bucket: SimpleNamespace(download=lambda _name: b"assemblyai transcript"))

    def finish(self):
        self.rows = [{"transcript_filename": "aapl_vid123_transcript.txt"}]

    def table(self, _name):
        calls = self

        class Query:
            def select(self, _columns):
                return self

            def eq(self, column, value):
                self.match = column == "video_identifier" and value == "vid123"
                return self

            def execute(self):
                return SimpleNamespace(data=calls.rows if self.match else [])

        return Query()


@pytest.fixture
def calls(monkeypatch, tmp_path):
    db = ProcessedCalls()
    fetched = []
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(api_chatbot, "supabase", db)
    monkeypatch.setattr(api_chatbot, "UPLOADS_DIR", str(tmp_path / "uploads"))
    monkeypatch.setattr(api_chatbot, "_chat_transcripts", {})
    monkeypatch.setattr(api_chatbot, "_caption_transcripts", {})
    monkeypatch.setattr(api_chatbot, "get_video_transcript", lambda url: fetched.append(url) or "youtube captions")
    return SimpleNamespace(db=db, fetched=fetched)


def transcript_for(url):
    req = api_chatbot.ChatRequest(message="hi", video_url=url)
    path, error = api_chatbot._resolve_chat_transcript(req, api_chatbot._chat_source_key(req))
    assert error is None
    return open(path, encoding="utf-8").read()


def test_chat_during_processing_switches_to_the_pipeline_transcript(calls):
    assert transcript_for(LINKS[0]) == "youtube captions"
    assert transcript_for(LINKS[0]) == "youtube captions"
    assert len(calls.fetched) == 1  # captions are reused while waiting, not refetched per message

    calls.db.finish()

    assert transcript_for(LINKS[0]) == "assemblyai transcript"


def test_pipeline_transcript_is_cached(calls, monkeypatch):
    calls.db.finish()
    assert transcript_for(LINKS[0]) == "assemblyai transcript"

    monkeypatch.setattr(api_chatbot, "supabase", None)  # no further lookups needed

    assert transcript_for(LINKS[0]) == "assemblyai transcript"


@pytest.mark.parametrize("url", LINKS)
def test_every_link_form_finds_the_pipeline_transcript(calls, url):
    calls.db.finish()
    assert transcript_for(url) == "assemblyai transcript" and calls.fetched == []
