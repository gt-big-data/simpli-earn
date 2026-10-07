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


def _request_user_id(authorization: Optional[str]) -> Optional[str]:
    """
    Supabase user id for an `Authorization: Bearer <access token>` header, recorded as the
    dashboard's owner (video_analyses.created_by). Signed-out requests return None.
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
    return str(user.id)


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


def _has_complete_analysis(video_id: Optional[str]) -> bool:
    """True if video_analyses already has transcript + both sentiment files for this video."""
    sb = _get_supabase()
    if not video_id or not sb:
        return False
    try:
        res = (
            sb.table("video_analyses")
            .select("transcript_filename,relevance_filename,specificity_filename")
            .eq("video_identifier", video_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[dashboard] existing-analysis check failed: {e}")
        return False
    row = res.data[0] if res.data else {}
    return all(row.get(k) for k in ("transcript_filename", "relevance_filename", "specificity_filename"))


def run_dashboard_creation(
    job_id: str, youtube_url: str, ticker: Optional[str] = None, created_by: Optional[str] = None
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
    created_by = _request_user_id(authorization)
    video_id = _extract_video_id(request.youtube_url)
    if not request.force and _has_complete_analysis(video_id):
        return {
            "job_id": None,
            "status": "completed",
            "message": "Dashboard already exists",
            "video_id": video_id,
            "existing": True,
        }

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
        try:
            try:
                sb.table("youtube_jobs").insert(job_row).execute()
            except Exception as e:
                if "created_by" not in job_row or "created_by" not in str(e):
                    raise
                print("[dashboard] youtube_jobs has no created_by column (docs/migrations/004); queuing without owner")
                job_row.pop("created_by")
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
    background_tasks.add_task(run_dashboard_creation, job_id, request.youtube_url, request.ticker, created_by)

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
