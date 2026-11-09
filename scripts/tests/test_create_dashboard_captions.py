"""Captions fast path in create_dashboard_from_youtube.py.

Goal of these tests: prove that when YouTube captions exist the pipeline uses them and
SKIPS the slow audio download + AssemblyAI transcription, and that it falls back to that
slow path (unchanged) whenever captions are missing, empty, too short, or error out.

The script lives in scripts/ (not importable by name) and its __init__ builds a Supabase
client, so we load it by file path and instantiate via object.__new__ to exercise single
methods in isolation. get_video_transcript is injected through sys.modules because the
method imports it lazily (`from transcript_retrieval import get_video_transcript`).
"""

import importlib.util
import sys
import types
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent


def _load_module():
    # Loaded by file path because scripts/ is not an importable package; sys.path (incl.
    # RAG/ for transcript_retrieval) is set up by scripts/tests/conftest.py.
    spec = importlib.util.spec_from_file_location(
        "create_dashboard_from_youtube", SCRIPTS_DIR / "create_dashboard_from_youtube.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULE = _load_module()
LONG_TRANSCRIPT = "This is a real earnings call transcript. " * 20  # > 200 chars


@pytest.fixture
def creator():
    """A DashboardCreator with no __init__ side effects (no Supabase / AssemblyAI)."""
    return object.__new__(MODULE.DashboardCreator)


def _stub_transcript_retrieval(monkeypatch, *, returns=None, raises=None):
    """Install a fake transcript_retrieval module the method will import."""
    fake = types.ModuleType("transcript_retrieval")

    def get_video_transcript(url):
        if raises is not None:
            raise raises
        return returns

    fake.get_video_transcript = get_video_transcript
    monkeypatch.setitem(sys.modules, "transcript_retrieval", fake)


# --- fetch_youtube_captions: branch coverage ---------------------------------


def test_captions_available_returns_text(creator, monkeypatch):
    monkeypatch.delenv("CAPTIONS_FIRST", raising=False)
    _stub_transcript_retrieval(monkeypatch, returns=LONG_TRANSCRIPT)
    assert creator.fetch_youtube_captions("https://youtu.be/abc") == LONG_TRANSCRIPT


@pytest.mark.parametrize("flag", ["0", "false", "no", "off", "OFF"])
def test_captions_first_disabled_skips_fast_path(creator, monkeypatch, flag):
    monkeypatch.setenv("CAPTIONS_FIRST", flag)
    # If it tried to fetch, this stub would return text; it must not be consulted.
    _stub_transcript_retrieval(monkeypatch, returns=LONG_TRANSCRIPT)
    assert creator.fetch_youtube_captions("https://youtu.be/abc") is None


def test_error_string_falls_back(creator, monkeypatch):
    monkeypatch.delenv("CAPTIONS_FIRST", raising=False)
    _stub_transcript_retrieval(monkeypatch, returns="Error: Subtitles are disabled")
    assert creator.fetch_youtube_captions("https://youtu.be/abc") is None


def test_empty_transcript_falls_back(creator, monkeypatch):
    monkeypatch.delenv("CAPTIONS_FIRST", raising=False)
    _stub_transcript_retrieval(monkeypatch, returns="")
    assert creator.fetch_youtube_captions("https://youtu.be/abc") is None


def test_too_short_transcript_falls_back(creator, monkeypatch):
    monkeypatch.delenv("CAPTIONS_FIRST", raising=False)
    _stub_transcript_retrieval(monkeypatch, returns="hi there")
    assert creator.fetch_youtube_captions("https://youtu.be/abc") is None


def test_fetch_exception_falls_back(creator, monkeypatch):
    monkeypatch.delenv("CAPTIONS_FIRST", raising=False)
    _stub_transcript_retrieval(monkeypatch, raises=RuntimeError("network boom"))
    assert creator.fetch_youtube_captions("https://youtu.be/abc") is None


# --- process_youtube_video: the real payoff ----------------------------------


def _wire_pipeline(creator, monkeypatch, *, captions):
    """Stub every step after transcript selection so we can observe which path ran."""
    calls = {"download": 0, "assemblyai": 0}

    monkeypatch.setattr(creator, "extract_video_id", lambda url: "vid123")
    monkeypatch.setattr(creator, "get_youtube_metadata", lambda vid: {"title": "AAPL Q1", "upload_date": "20240101"})
    monkeypatch.setattr(creator, "guess_ticker_from_title", lambda title: "AAPL")
    monkeypatch.setattr(creator, "fetch_youtube_captions", lambda url: captions)

    def fake_download(url):
        calls["download"] += 1
        return "/tmp/audio.m4a"

    def fake_transcribe(audio):
        calls["assemblyai"] += 1
        return "transcribed via assemblyai " * 20

    monkeypatch.setattr(creator, "download_audio", fake_download)
    monkeypatch.setattr(creator, "transcribe_with_assemblyai", fake_transcribe)
    monkeypatch.setattr(creator, "save_transcript", lambda text, ident: "t.txt")
    monkeypatch.setattr(creator, "run_sentiment_analysis", lambda fn, ident: {
        "relevance_filename": "r.csv", "specificity_filename": "s.csv"})
    monkeypatch.setattr(creator, "cleanup", lambda: None)

    saved = {}
    monkeypatch.setattr(creator, "create_database_entry", lambda **kw: saved.update(kw) or True)
    return calls, saved


def test_pipeline_uses_captions_and_skips_audio_and_assemblyai(creator, monkeypatch):
    calls, saved = _wire_pipeline(creator, monkeypatch, captions=LONG_TRANSCRIPT)

    assert creator.process_youtube_video("https://youtu.be/abc", ticker_override="AAPL") is True
    assert calls == {"download": 0, "assemblyai": 0}  # slow path never touched
    assert saved["transcript_filename"] == "t.txt"


def test_pipeline_falls_back_to_audio_and_assemblyai_without_captions(creator, monkeypatch):
    calls, saved = _wire_pipeline(creator, monkeypatch, captions=None)

    assert creator.process_youtube_video("https://youtu.be/abc", ticker_override="AAPL") is True
    assert calls == {"download": 1, "assemblyai": 1}  # fell back exactly once each
    assert saved["transcript_filename"] == "t.txt"
