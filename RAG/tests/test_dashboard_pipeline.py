"""The pipeline only reports success when the dashboard it wrote is complete."""

import pytest

from test_dashboard_write import SCRIPT, RowStore

FILES = {"relevance_filename": "r.csv", "specificity_filename": "s.csv"}


def creator(tmp_path, store, sentiment):
    c = object.__new__(SCRIPT.DashboardCreator)
    c.supabase = store
    c.temp_dir = tmp_path
    c.get_youtube_metadata = lambda _vid: {"title": "Apple (AAPL) Q1", "upload_date": "20250101"}
    c.download_audio = lambda _url: tmp_path / "audio.m4a"
    c.transcribe_with_assemblyai = lambda _audio: "transcript text"
    c.save_transcript = lambda _text, identifier: f"{identifier}_transcript.txt"
    c.run_sentiment_analysis = lambda _name, _identifier: dict(sentiment)
    return c


def test_complete_run_succeeds(tmp_path):
    store = RowStore()

    assert creator(tmp_path, store, FILES).process_youtube_video("https://youtube.com/watch?v=vid", write_mode="safe")

    assert store.rows["vid"]["relevance_filename"] == "r.csv"


@pytest.mark.parametrize("sentiment", [{}, {"relevance_filename": "r.csv"}, {"specificity_filename": "s.csv"}])
def test_failed_sentiment_fails_the_job_but_keeps_the_transcript(tmp_path, capsys, sentiment):
    store = RowStore()

    assert not creator(tmp_path, store, sentiment).process_youtube_video("https://youtube.com/watch?v=vid", write_mode="safe")

    row = store.rows["vid"]
    assert row["transcript_filename"].endswith("_transcript.txt")
    assert not (row["relevance_filename"] and row["specificity_filename"])
    # The API reports the tail of the output as the job's error
    assert "Sentiment analysis failed" in capsys.readouterr().out.strip().splitlines()[-2]


def test_failed_sentiment_can_be_repaired_by_the_next_job(tmp_path):
    store = RowStore()
    creator(tmp_path, store, {}).process_youtube_video("https://youtube.com/watch?v=vid", write_mode="safe")

    assert creator(tmp_path, store, FILES).process_youtube_video("https://youtube.com/watch?v=vid", write_mode="safe")

    assert store.rows["vid"]["specificity_filename"] == "s.csv"


def test_concurrent_jobs_only_clean_up_their_own_files(tmp_path, monkeypatch):
    monkeypatch.setattr(SCRIPT, "__file__", str(tmp_path / "scripts" / "create_dashboard_from_youtube.py"))
    monkeypatch.setattr(SCRIPT, "create_client", lambda *_: None)
    monkeypatch.setattr(SCRIPT.DashboardCreator, "load_env", lambda self: None)
    first, second = SCRIPT.DashboardCreator(), SCRIPT.DashboardCreator()
    (first.temp_dir / "audio.m4a").write_text("first")
    (second.temp_dir / "audio.m4a").write_text("second")

    first.cleanup()

    assert not first.temp_dir.exists()
    assert (second.temp_dir / "audio.m4a").read_text() == "second"
    assert first.temp_dir.parent == second.temp_dir.parent == tmp_path / "temp_processing"


def test_failed_download_cleans_up(tmp_path):
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    c = creator(job_dir, RowStore(), FILES)
    c.download_audio = lambda _url: (job_dir / "partial.part").write_text("x") and None

    assert not c.process_youtube_video("https://youtube.com/watch?v=vid")

    assert not job_dir.exists()
