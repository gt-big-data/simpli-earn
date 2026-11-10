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
  HOME_YOUTUBE_SCRIPT_TIMEOUT_SEC — per-job limit (default 7200); "running" jobs older than this
                            plus a margin are marked failed (e.g. the worker was killed mid-job)
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

FINISH_ATTEMPTS = 4
STALE_MARGIN_SEC = 600

# Repo root (parent of scripts/)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "RAG"))

from youtube_ids import extract_video_id


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


def script_timeout_sec() -> int:
    return int(os.getenv("HOME_YOUTUBE_SCRIPT_TIMEOUT_SEC", "7200"))


def run_pipeline(youtube_url: str, ticker: Optional[str]) -> Tuple[int, str, str]:
    script = ROOT / "scripts" / "create_dashboard_from_youtube.py"
    cmd = [sys.executable, str(script), youtube_url]
    if ticker:
        cmd.extend(["--ticker", ticker])
    # Create the dashboard or repair an incomplete one; never replace a complete analysis
    cmd.extend(["--write-mode", "safe"])
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=script_timeout_sec(),
    )
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    # Keep the tail: the failing step is printed last, after the progress banner
    return proc.returncode, out, out.strip()[-2000:]


def finish_job(sb, job_id: str, success: bool, video_id: Optional[str], error: Optional[str]) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "completed" if success else "failed",
        "completed_at": now,
        "video_id": video_id,
        "error": error[:5000] if error else None,
    }
    # A lost write would leave the job "running" forever, so retry; fail_stale_jobs is the backstop
    for attempt in range(FINISH_ATTEMPTS):
        try:
            sb.table("youtube_jobs").update(payload).eq("id", job_id).execute()
            return
        except Exception as e:
            print(f"⚠️  Could not record job {job_id} as {payload['status']} (attempt {attempt + 1}): {e}")
            if attempt + 1 < FINISH_ATTEMPTS:
                time.sleep(2 ** attempt)
    print(f"❌ Giving up on recording job {job_id}; it will be marked failed once it goes stale")


def fail_stale_jobs(sb) -> None:
    """Mark "running" jobs that outlived the script timeout as failed (worker killed, write lost)."""
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=script_timeout_sec() + STALE_MARGIN_SEC)
    try:
        res = (
            sb.table("youtube_jobs")
            .update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": "Processing stopped without finishing (worker restarted or timed out). Submit the link again.",
            })
            .eq("status", "running")
            .lt("created_at", cutoff.isoformat())
            .execute()
        )
    except Exception as e:
        # Never let the sweep block processing new jobs
        print(f"⚠️  Could not check for stale jobs: {e}")
        return
    for row in res.data or []:
        print(f"⚠️  Marked stale job {row.get('id')} as failed")


def process_one(sb) -> bool:
    """Returns True if a job was processed."""
    row = claim_one_pending(sb)
    if not row:
        return False
    job_id = row["id"]
    url = row["youtube_url"]
    ticker = row.get("ticker")
    print(f"\n{'='*60}\n🏠 Claimed job {job_id}\n📹 {url}\n💹 ticker={ticker!r}\n{'='*60}")
    vid = extract_video_id(url)
    try:
        code, combined, err_snip = run_pipeline(url, ticker)
    except subprocess.TimeoutExpired:
        print(f"❌ Pipeline timed out after {script_timeout_sec()}s")
        finish_job(sb, job_id, False, vid, f"Processing timeout ({script_timeout_sec() // 60} minutes)")
        return True
    except Exception as e:
        print(f"❌ Pipeline could not run: {e}")
        finish_job(sb, job_id, False, vid, str(e))
        return True
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
            fail_stale_jobs(sb)
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
