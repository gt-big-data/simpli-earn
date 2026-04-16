#!/usr/bin/env python3
"""
Poll Supabase youtube_jobs and run create_dashboard_from_youtube.py on pending rows.

Use this on a home PC / Raspberry Pi (residential IP) so yt-dlp avoids Cloud Run 429s.

Setup:
  1. Run docs/migrations/001_youtube_jobs.sql in Supabase.
  2. Copy sentiment/.env (or export SUPABASE_URL, SUPABASE_KEY, ASSEMBLYAI_KEY, HF_TOKEN, ...).
  3. Install: pip install supabase python-dotenv (plus project venv with RAG+sentiment deps).
  4. Set Cloud Run (RAG) env YOUTUBE_HOME_WORKER=1 so /dashboard/create-dashboard only enqueues.

Usage (from repo root, venv active):
  python scripts/home_youtube_worker.py

Env:
  HOME_YOUTUBE_POLL_SEC   — seconds between idle polls (default 15)
  HOME_YOUTUBE_ONCE       — if 1, process at most one job then exit (good for cron)
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

# Repo root (parent of scripts/)
ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for p in (ROOT / "sentiment" / ".env", ROOT / "RAG" / ".env", ROOT / ".env"):
        if p.exists():
            load_dotenv(p)


def get_supabase():
    from supabase import create_client

    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("❌ SUPABASE_URL and SUPABASE_KEY required")
        sys.exit(1)
    return create_client(url, key)


def extract_video_id(youtube_url: str) -> Optional[str]:
    if "v=" in youtube_url:
        return youtube_url.split("v=")[1].split("&")[0]
    if "youtu.be/" in youtube_url:
        return youtube_url.split("youtu.be/")[1].split("?")[0]
    if "youtube.com/live/" in youtube_url:
        return youtube_url.split("youtube.com/live/")[1].split("?")[0]
    return None


def claim_one_pending(sb) -> Optional[Dict[str, Any]]:
    """Fetch oldest pending job and atomically move to running."""
    res = (
        sb.table("youtube_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    job_id = row["id"]
    claimed = (
        sb.table("youtube_jobs")
        .update({"status": "running"})
        .eq("id", job_id)
        .eq("status", "pending")
        .execute()
    )
    if not claimed.data:
        return None
    return row


def run_pipeline(youtube_url: str, ticker: Optional[str]) -> Tuple[int, str, str]:
    script = ROOT / "scripts" / "create_dashboard_from_youtube.py"
    cmd = [sys.executable, str(script), youtube_url]
    if ticker:
        cmd.extend(["--ticker", ticker])
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=int(os.getenv("HOME_YOUTUBE_SCRIPT_TIMEOUT_SEC", "7200")),
    )
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    return proc.returncode, out, (proc.stderr or proc.stdout or "")[:2000]


def finish_job(sb, job_id: str, success: bool, video_id: Optional[str], error: Optional[str]) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "completed" if success else "failed",
        "completed_at": now,
        "video_id": video_id,
        "error": error[:5000] if error else None,
    }
    sb.table("youtube_jobs").update(payload).eq("id", job_id).execute()


def process_one(sb) -> bool:
    """Returns True if a job was processed."""
    row = claim_one_pending(sb)
    if not row:
        return False
    job_id = row["id"]
    url = row["youtube_url"]
    ticker = row.get("ticker")
    print(f"\n{'='*60}\n🏠 Claimed job {job_id}\n📹 {url}\n💹 ticker={ticker!r}\n{'='*60}")
    code, combined, err_snip = run_pipeline(url, ticker)
    vid = extract_video_id(url)
    if code == 0:
        print("✅ Pipeline finished OK")
        finish_job(sb, job_id, True, vid, None)
    else:
        print(f"❌ Pipeline exit {code}\n{err_snip}")
        finish_job(sb, job_id, False, vid, err_snip or combined[:500])
    return True


def main() -> None:
    load_env()
    sb = get_supabase()
    poll = float(os.getenv("HOME_YOUTUBE_POLL_SEC", "15"))
    once = os.getenv("HOME_YOUTUBE_ONCE", "").lower() in ("1", "true", "yes")

    print("Home YouTube worker started (Ctrl+C to stop)")
    print(f"Poll interval: {poll}s | ONCE={once}")

    while True:
        try:
            did = process_one(sb)
            if once:
                break
            if not did:
                time.sleep(poll)
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"⚠️  Worker error: {e}")
            time.sleep(poll)


if __name__ == "__main__":
    main()
