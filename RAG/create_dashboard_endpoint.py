"""
API endpoint to trigger dashboard creation from YouTube URL.

Modes:
- Default: run create_dashboard_from_youtube.py as a background subprocess. Job status is kept in
  memory and mirrored to Supabase youtube_jobs, so a status poll that reaches another Cloud Run
  instance still finds the job.
- YOUTUBE_HOME_WORKER=1: insert a row into Supabase youtube_jobs; a machine at home (residential IP)
  runs scripts/home_youtube_worker.py to execute yt-dlp + the rest of the pipeline.
"""

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
import subprocess
import sys
import os
import uuid
from datetime import datetime
from pathlib import Path

from youtube_ids import extract_video_id

router = APIRouter()

# Jobs this instance is running (also mirrored to youtube_jobs, see _save_job)
jobs: dict[str, dict[str, Any]] = {}

_supabase = None


def _youtube_home_worker_enabled() -> bool:
    return os.getenv("YOUTUBE_HOME_WORKER", "").strip().lower() in ("1", "true", "yes", "on")


def _get_supabase():
    global _supabase
    if _supabase is not None:
        return _supabase
    try:
        from supabase import create_client
    except ImportError:
        return None
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not url or not key:
        return None
    _supabase = create_client(url, key)
    return _supabase


def _request_user(authorization: Optional[str]):
    """
    Supabase user for an `Authorization: Bearer <access token>` header, used to check whether the
    caller may force-reprocess an existing dashboard. Signed-out requests return None.
    """
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    sb = _get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Authentication unavailable: Supabase not configured")
    try:
        user = sb.auth.get_user(token.strip()).user
    except Exception:
        user = None
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _csv_env(name: str) -> set[str]:
    return {value.strip().lower() for value in os.getenv(name, "").split(",") if value.strip()}


def _is_admin(user) -> bool:
    """Users in DASHBOARD_ADMIN_USER_IDS / DASHBOARD_ADMIN_EMAILS may force-reprocess dashboards."""
    if user is None:
        return False
    email = (getattr(user, "email", None) or "").lower()
    return str(user.id).lower() in _csv_env("DASHBOARD_ADMIN_USER_IDS") or (
        bool(email) and email in _csv_env("DASHBOARD_ADMIN_EMAILS")
    )


def _row_to_job_status(row: dict) -> dict:
    def ts(v):
        if v is None:
            return None
        if isinstance(v, str):
            return v
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    return {
        "job_id": str(row["id"]),
        "status": row["status"],
        "youtube_url": row["youtube_url"],
        "video_id": row.get("video_id"),
        "error": row.get("error"),
        "created_at": ts(row.get("created_at")),
        "completed_at": ts(row.get("completed_at")),
    }


class CreateDashboardRequest(BaseModel):
    youtube_url: str
    ticker: Optional[str] = None
    force: bool = False  # reprocess even if an analysis already exists


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    youtube_url: str
    video_id: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

def _dashboard_project_root() -> Path:
    """Parent of RAG/: repo root locally, /app in Cloud Run image."""
    return Path(__file__).resolve().parent.parent


_ANALYSIS_FILES = ("transcript_filename", "relevance_filename", "specificity_filename")


def _existing_analysis(video_id: Optional[str]) -> Optional[dict]:
    """
    The video's video_analyses row (file names), or None if it has none.
    Fails closed: if the lookup errors we cannot tell whether a force would replace a complete
    dashboard, so the request is refused.
    """
    sb = _get_supabase()
    if not video_id or not sb:
        return None
    try:
        res = (
            sb.table("video_analyses").select(",".join(_ANALYSIS_FILES))
            .eq("video_identifier", video_id).limit(1).execute()
        )
    except Exception as e:
        print(f"[dashboard] existing-analysis check failed: {e}")
        raise HTTPException(status_code=503, detail="Could not check for an existing dashboard; try again") from e
    return res.data[0] if res.data else None


def _save_job(job: dict) -> None:
    """
    Mirror an in-process job to youtube_jobs so any instance can answer its status poll. It is
    stored as "running" while queued: a "pending" row would be claimed by a home worker.
    Best effort: if the write fails, polls that reach this instance still work.
    """
    sb = _get_supabase()
    if not sb:
        return
    row = {
        "id": job["job_id"],
        "youtube_url": job["youtube_url"],
        "ticker": job.get("ticker"),
        "status": "running" if job["status"] == "pending" else job["status"],
        "video_id": job.get("video_id"),
        "error": job.get("error"),
        "completed_at": job.get("completed_at"),
    }
    try:
        sb.table("youtube_jobs").upsert(row).execute()
    except Exception as e:
        print(f"[dashboard] could not save job {job['job_id']} to youtube_jobs: {e}")


def _update_job(job_id: str, **fields) -> None:
    jobs[job_id].update(fields)
    _save_job(jobs[job_id])


def _finish_job(job_id: str, status: str, error: Optional[str] = None, video_id: Optional[str] = None) -> None:
    _update_job(job_id, status=status, error=error, video_id=video_id, completed_at=datetime.now().isoformat())


def run_dashboard_creation(
    job_id: str, youtube_url: str, ticker: Optional[str] = None, write_mode: str = "safe"
):
    """Run the dashboard creation script in background (local / Cloud Run with YouTube access)."""
    _update_job(job_id, status="running")

    try:
        project_root = _dashboard_project_root()
        script_path = project_root / "scripts" / "create_dashboard_from_youtube.py"

        if not script_path.is_file():
            _finish_job(job_id, "failed", error=f"Dashboard script missing: {script_path}")
            return

        cmd = [sys.executable, str(script_path), youtube_url]
        if ticker:
            cmd.extend(["--ticker", ticker])
        # The script enforces this atomically when it writes the row (see --write-mode)
        cmd.extend(["--write-mode", write_mode])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800,  # 30 minute timeout
            cwd=str(project_root),
        )

        if result.returncode == 0:
            _finish_job(job_id, "completed", video_id=extract_video_id(youtube_url))
        else:
            # Keep the tail: the failing step is printed last, after the progress banner
            err_msg = ((result.stdout or "") + (result.stderr or "")).strip()[-1500:] or "Unknown error"
            _finish_job(job_id, "failed", error=err_msg)
            print(f"[dashboard] Job {job_id} FAILED (exit {result.returncode}):\n{result.stderr or result.stdout}")

    except subprocess.TimeoutExpired:
        _finish_job(job_id, "failed", error="Processing timeout (30 minutes)")
    except Exception as e:
        _finish_job(job_id, "failed", error=str(e))


@router.post("/create-dashboard", response_model=dict)
async def create_dashboard(
    request: CreateDashboardRequest,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
):
    """
    Trigger dashboard creation from YouTube URL.
    With YOUTUBE_HOME_WORKER=1, only enqueues to Supabase; home worker runs yt-dlp.
    Already-processed videos return immediately (status "completed", job_id None).
    Jobs create the dashboard or repair an incomplete one, never replacing a complete analysis;
    `force` on a complete dashboard needs an admin (DASHBOARD_ADMIN_*) and replaces it.
    """
    video_id = extract_video_id(request.youtube_url)
    existing = _existing_analysis(video_id)
    complete = bool(existing) and all(existing.get(k) for k in _ANALYSIS_FILES)
    if complete and not request.force:
        return {
            "job_id": None,
            "status": "completed",
            "message": "Dashboard already exists",
            "video_id": video_id,
            "existing": True,
        }
    write_mode = "safe"
    if complete:
        # Only replacing a complete dashboard needs to know who is asking. Plain uploads never check
        # the token, so a Supabase auth hiccup cannot turn a signed-in user's upload into a 401.
        user = _request_user(authorization)
        if not _is_admin(user):
            if user is None:
                raise HTTPException(status_code=401, detail="Sign in as an admin to reprocess an existing dashboard")
            raise HTTPException(status_code=403, detail="Only an admin can reprocess an existing dashboard")
        if _youtube_home_worker_enabled():
            # The queue cannot carry "forced", and the worker never replaces a complete analysis
            raise HTTPException(
                status_code=409,
                detail="Reprocessing an existing dashboard is not available while jobs run on the home worker",
            )
        write_mode = "force"

    if _youtube_home_worker_enabled():
        sb = _get_supabase()
        if not sb:
            raise HTTPException(
                status_code=503,
                detail="YOUTUBE_HOME_WORKER is enabled but Supabase is not configured (SUPABASE_URL / SUPABASE_KEY).",
            )
        job_id = str(uuid.uuid4())
        job_row = {
            "id": job_id,
            "youtube_url": request.youtube_url,
            "ticker": request.ticker,
            "status": "pending",
        }
        try:
            sb.table("youtube_jobs").insert(job_row).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to enqueue job: {e}") from e

        return {
            "job_id": job_id,
            "status": "pending",
            "message": "Queued for home worker (YouTube download will run on your residential machine)",
            "ticker_provided": request.ticker is not None,
            "home_worker": True,
        }

    # Same video already processing (e.g. submitted twice): reuse that job
    for job in jobs.values():
        if job["status"] in ("pending", "running") and extract_video_id(job["youtube_url"]) == video_id:
            return {
                "job_id": job["job_id"],
                "status": job["status"],
                "message": "Dashboard creation already in progress",
                "ticker_provided": request.ticker is not None,
                "home_worker": False,
            }

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "youtube_url": request.youtube_url,
        "ticker": request.ticker,
        "video_id": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
    }
    _save_job(jobs[job_id])
    background_tasks.add_task(run_dashboard_creation, job_id, request.youtube_url, request.ticker, write_mode)

    return {
        "job_id": job_id,
        "status": "pending",
        "message": "Dashboard creation started",
        "ticker_provided": request.ticker is not None,
        "home_worker": False,
    }


@router.get("/job-status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get status of dashboard creation job (this instance's memory, else Supabase youtube_jobs)."""
    if job_id in jobs:
        return jobs[job_id]

    sb = _get_supabase()
    if not sb:
        if _youtube_home_worker_enabled():
            raise HTTPException(status_code=503, detail="Supabase not configured")
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        uuid.UUID(job_id)  # youtube_jobs.id is a uuid; anything else cannot be a job
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        res = sb.table("youtube_jobs").select("*").eq("id", job_id).limit(1).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_job_status(res.data[0])


@router.get("/jobs", response_model=list[JobStatus])
async def list_jobs():
    """List recent jobs (memory or last 50 from Supabase)."""
    if _youtube_home_worker_enabled():
        sb = _get_supabase()
        if not sb:
            return []
        try:
            res = (
                sb.table("youtube_jobs")
                .select("*")
                .order("created_at", desc=True)
                .limit(50)
                .execute()
            )
            return [_row_to_job_status(row) for row in (res.data or [])]
        except Exception:
            return []

    return list(jobs.values())
