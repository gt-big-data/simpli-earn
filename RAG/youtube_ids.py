"""
The one YouTube video-ID parser. Dashboards are keyed by video ID, so every service must read a
link the same way or a processed call cannot be found by the player, chat, red flags or sentiment.

sentiment/youtube_ids.py is a byte-for-byte copy (the sentiment service deploys on its own), and the
frontend's lib/youtube.ts mirrors it; tests run all three against RAG/tests/youtube_url_cases.json.
"""

import re
from typing import Optional

_VIDEO_ID = re.compile(
    r"(?:[?&]v=|youtu\.be/|youtube(?:-nocookie)?\.com/(?:live|embed|shorts|v)/)([A-Za-z0-9_-]+)"
)


def extract_video_id(url: Optional[str]) -> Optional[str]:
    """Video ID from a watch, youtu.be, live, embed or shorts link; None if the link has none."""
    if not url:
        return None
    match = _VIDEO_ID.search(url.strip())
    return match.group(1) if match else None
