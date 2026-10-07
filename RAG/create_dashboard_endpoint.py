"""
API endpoint to trigger dashboard creation from YouTube URL.

Modes:
- Default: run create_dashboard_from_youtube.py as a background subprocess (in-memory job status).
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

router = APIRouter()

# In-memory jobs when not using home worker
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
    Supabase user for an `Authorization: Bearer <access token>` header; its id is recorded as a
    new dashboard's owner (video_analyses.created_by). Signed-out requests return None.
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
    """Same allowlist as the sentiment API's library_auth.is_admin."""
    if user is None:
        return False
    email = (getattr(user, "email", None) or "").lower()
    return str(user.id).lower() in _csv_env("LIBRARY_ADMIN_USER_IDS") or (
        bool(email) and email in _csv_env("LIBRARY_ADMIN_EMAILS")
    )


def _can_reprocess(user, row: dict) -> bool:
    """Reprocessing replaces a dashboard's transcript and analysis: owner or admin only."""
    if user is None:
        return False
    owner = row.get("created_by")
    return (bool(owner) and str(owner) == str(user.id)) or _is_admin(user)


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


def _extract_video_id(youtube_url: str) -> Optional[str]:
    if "v=" in youtube_url:
        return youtube_url.split("v=")[1].split("&")[0]
    if "youtu.be/" in youtube_url:
        return youtube_url.split("youtu.be/")[1].split("?")[0]
    if "youtube.com/live/" in youtube_url:
        return youtube_url.split("youtube.com/live/")[1].split("?")[0]
    return None


_ANALYSIS_FILES = ("transcript_filename", "relevance_filename", "specificity_filename")


def _existing_analysis(video_id: Optional[str]) -> Optional[dict]:
    """
    The video's video_analyses row (file names and owner), or None if it has none.
    Fails closed: if the lookup errors we cannot tell whether reprocessing would overwrite
    someone else's dashboard, so the request is refused.
    """
    sb = _get_supabase()
    if not video_id or not sb:
        return None
    query = lambda columns: (
        sb.table("video_analyses").select(columns).eq("video_identifier", video_id).limit(1).execute()
    )
    try:
        try:
            res = query(",".join(_ANALYSIS_FILES + ("created_by",)))
        except Exception as e:
            if "created_by" not in str(e):
                raise
            # Migration 004 not applied: every existing row is ownerless (admin-only)
            res = query(",".join(_ANALYSIS_FILES))
    except Exception as e:
        print(f"[dashboard] existing-analysis check failed: {e}")
        raise HTTPException(status_code=503, detail="Could not check for an existing dashboard; try again") from e
    return res.data[0] if res.data else None


def run_dashboard_creation(
    job_id: str,
    youtube_url: str,
    ticker: Optional[str] = None,
    created_by: Optional[str] = None,
    expect_owner: str = "new",
):
    """Run the dashboard creation script in background (local / Cloud Run with YouTube access)."""
    jobs[job_id]["status"] = "running"

    try:
        project_root = _dashboard_project_root()
        script_path = project_root / "scripts" / "create_dashboard_from_youtube.py"

        if not script_path.is_file():
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = f"Dashboard script missing: {script_path}"
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            return

        cmd = [sys.executable, str(script_path), youtube_url]
        if ticker:
            cmd.extend(["--ticker", ticker])
        if created_by:
            cmd.extend(["--created-by", created_by])
        # The script re-checks this atomically when it writes the row
        cmd.extend(["--expect-owner", expect_owner])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800,  # 30 minute timeout
            cwd=str(project_root),
        )

        if result.returncode == 0:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            jobs[job_id]["video_id"] = _extract_video_id(youtube_url)
        else:
            jobs[job_id]["status"] = "failed"
            # Keep the tail: the failing step is printed last, after the progress banner
            err_msg = ((result.stdout or "") + (result.stderr or "")).strip()[-1500:] or "Unknown error"
            jobs[job_id]["error"] = err_msg
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            print(f"[dashboard] Job {job_id} FAILED (exit {result.returncode}):\n{result.stderr or result.stdout}")

    except subprocess.TimeoutExpired:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = "Processing timeout (30 minutes)"
        jobs[job_id]["completed_at"] = datetime.now().isoformat()
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completed_at"] = datetime.now().isoformat()


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
    A signed-in caller (Bearer token) is recorded as the new dashboard's owner.
    """
    user = _request_user(authorization)
    created_by = str(user.id) if user else None
    video_id = _extract_video_id(request.youtube_url)
    existing = _existing_analysis(video_id)
    if existing and not request.force and all(existing.get(k) for k in _ANALYSIS_FILES):
        return {
            "job_id": None,
            "status": "completed",
            "message": "Dashboard already exists",
            "video_id": video_id,
            "existing": True,
        }
    # Anything past this point (force, or retrying an incomplete analysis) overwrites the row
    if existing and not _can_reprocess(user, existing):
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in as this dashboard's owner to reprocess it")
        raise HTTPException(status_code=403, detail="Only this dashboard's owner or an admin can reprocess it")
    # What this authorization assumed about the row; the pipeline writes only if it still holds
    # ("new": nobody created it meanwhile; otherwise: still owned by the same owner)
    expect_owner = "new" if existing is None else str(existing.get("created_by") or "none")

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
        if created_by:
            job_row["created_by"] = created_by
        job_row["expected_owner"] = expect_owner
        try:
            while True:
                try:
                    sb.table("youtube_jobs").insert(job_row).execute()
                    break
                except Exception as e:
                    # Columns from migrations 004/005 may be missing. Without expected_owner the
                    # worker treats the job as "new" (insert only), so reprocessing fails safe.
                    missing = next((c for c in ("created_by", "expected_owner") if c in job_row and c in str(e)), None)
                    if not missing:
                        raise
                    print(f"[dashboard] youtube_jobs has no {missing} column (docs/migrations); queuing without it")
                    job_row.pop(missing)
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
        if job["status"] in ("pending", "running") and _extract_video_id(job["youtube_url"]) == video_id:
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
        "video_id": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
    }
    background_tasks.add_task(
        run_dashboard_creation, job_id, request.youtube_url, request.ticker, created_by, expect_owner
    )

    return {
        "job_id": job_id,
        "status": "pending",
        "message": "Dashboard creation started",
        "ticker_provided": request.ticker is not None,
        "home_worker": False,
    }


@router.get("/job-status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get status of dashboard creation job (memory or Supabase youtube_jobs)."""
    if _youtube_home_worker_enabled():
        sb = _get_supabase()
        if not sb:
            raise HTTPException(status_code=503, detail="Supabase not configured")
        try:
            res = sb.table("youtube_jobs").select("*").eq("id", job_id).limit(1).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
        if not res.data:
            raise HTTPException(status_code=404, detail="Job not found")
        return _row_to_job_status(res.data[0])

    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


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
