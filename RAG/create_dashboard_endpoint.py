"""
API endpoint to trigger dashboard creation from YouTube URL
This runs the create_dashboard_from_youtube.py script as a background job
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import subprocess
import sys
from pathlib import Path
import uuid
from datetime import datetime

router = APIRouter()

# Track running jobs
jobs = {}

class CreateDashboardRequest(BaseModel):
    youtube_url: str
    ticker: Optional[str] = None

class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    youtube_url: str
    video_id: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

def run_dashboard_creation(job_id: str, youtube_url: str, ticker: Optional[str] = None):
    """Run the dashboard creation script in background"""
    jobs[job_id]["status"] = "running"
    
    try:
        # Get path to the script
        script_path = Path(__file__).parent.parent / "scripts" / "create_dashboard_from_youtube.py"
        
        # Build command with optional ticker
        cmd = [sys.executable, str(script_path), youtube_url]
        if ticker:
            cmd.extend(["--ticker", ticker])
        
        # Run the script
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800  # 30 minute timeout
        )
        
        if result.returncode == 0:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            
            # Try to extract video_id from output or URL
            video_id = None
            if "v=" in youtube_url:
                video_id = youtube_url.split("v=")[1].split("&")[0]
            elif "youtu.be/" in youtube_url:
                video_id = youtube_url.split("youtu.be/")[1].split("?")[0]
            elif "youtube.com/live/" in youtube_url:
                video_id = youtube_url.split("youtube.com/live/")[1].split("?")[0]
                
            jobs[job_id]["video_id"] = video_id
        else:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = result.stderr
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            
    except subprocess.TimeoutExpired:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = "Processing timeout (30 minutes)"
        jobs[job_id]["completed_at"] = datetime.now().isoformat()
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completed_at"] = datetime.now().isoformat()

@router.post("/create-dashboard", response_model=dict)
async def create_dashboard(request: CreateDashboardRequest, background_tasks: BackgroundTasks):
    """
    Trigger dashboard creation from YouTube URL
    Returns job_id to track progress
    """
    # Generate job ID
    job_id = str(uuid.uuid4())
    
    # Initialize job status
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "youtube_url": request.youtube_url,
        "video_id": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None
    }
    
    # Start background task
    background_tasks.add_task(run_dashboard_creation, job_id, request.youtube_url, request.ticker)
    
    return {
        "job_id": job_id,
        "status": "pending",
        "message": "Dashboard creation started",
        "ticker_provided": request.ticker is not None
    }

@router.get("/job-status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get status of dashboard creation job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]

@router.get("/jobs", response_model=list[JobStatus])
async def list_jobs():
    """List all jobs"""
    return list(jobs.values())

