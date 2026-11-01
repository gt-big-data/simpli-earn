"""Every service reads a YouTube link the same way, so a processed call is found wherever it is looked up."""

import json
from pathlib import Path

import pytest

import create_dashboard_endpoint
import youtube_ids
from conftest import RAG_DIR
from test_dashboard_write import SCRIPT

CASES = json.loads((Path(__file__).parent / "youtube_url_cases.json").read_text())


@pytest.mark.parametrize("url, expected", CASES)
def test_parser(url, expected):
    assert youtube_ids.extract_video_id(url) == expected


def test_sentiment_service_ships_the_same_parser():
    # The sentiment service deploys from sentiment/ alone, so it carries a copy; it must not drift
    assert (RAG_DIR.parent / "sentiment" / "youtube_ids.py").read_bytes() == (RAG_DIR / "youtube_ids.py").read_bytes()


@pytest.mark.parametrize("url, expected", [c for c in CASES if c[1]])
def test_callers_use_the_shared_parser(url, expected):
    import api_chatbot

    assert create_dashboard_endpoint.extract_video_id(url) == expected
    assert object.__new__(SCRIPT.DashboardCreator).extract_video_id(url) == expected
    assert api_chatbot._normalize_video_id(None, url) == expected  # red flags
    assert api_chatbot.extract_video_id(url) == expected  # /video-info
