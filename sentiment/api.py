"""
FastAPI backend for sentiment analysis
Endpoints:
  - POST /analyze/specificity - Run specificity analysis
  - POST /analyze/relevance - Run relevance analysis
  - GET /sentiment - List all results in sentiment bucket
  - GET /sentiment/{filename} - Download a specific result file
  - GET /sentiment/{filename}/data - Get result data as JSON
  - GET /transcripts - List all transcripts in transcripts bucket
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import subprocess
import asyncio
from datetime import datetime
from pathlib import Path
import io
import csv

# Load environment variables
try:
    from dotenv import load_dotenv
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        env_file = parent / '.env'
        if env_file.exists():
            load_dotenv(env_file)
            break
except ImportError:
    pass

# Supabase client
try:
    from supabase import create_client, Client
    
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"⚠️  Warning: Supabase client initialization failed: {e}")
    supabase = None

app = FastAPI(
    title="Sentiment Analysis API",
    description="API for running sentiment analysis on transcripts",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job tracking
jobs = {}

# Pydantic models
class AnalysisRequest(BaseModel):
    input_file: str  # filename in transcripts bucket
    output_file: Optional[str] = None  # optional custom output name
    batch_size: Optional[int] = 32
    ma_window: Optional[int] = 20
    track_metadata: Optional[bool] = False

class AnalysisResponse(BaseModel):
    job_id: str
    status: str
    message: str
    output_file: Optional[str] = None

class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    analysis_type: str  # specificity or relevance
    input_file: str
    output_file: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None

class FileInfo(BaseModel):
    name: str
    size: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class VideoSentimentRequest(BaseModel):
    dashboard_id: Optional[str] = None
    video_url: Optional[str] = None

class VideoSentimentResponse(BaseModel):
    relevance_data: dict
    specificity_data: dict
    video_identifier: str


# Helper functions
def extract_youtube_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats."""
    import re
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def normalize_video_identifier(dashboard_id: Optional[str], video_url: Optional[str]) -> Optional[str]:
    """Normalize to YouTube video ID format (without video_ prefix to match database)."""
    # First try video_url
    if video_url:
        video_id = extract_youtube_video_id(video_url)
        if video_id:
            return video_id  # Return raw ID without prefix
    
    # Fall back to dashboard ID mapping
    if dashboard_id:
        VIDEO_ID_MAPPINGS = {
            "1": "dC9yOuhiNrk",  # Apple
            "2": "8K4aHLrekqQ",  # CVS
            "3": "URIsVKPmhGg",  # Google/Alphabet
            "4": "fouFNKTDPmk",  # Shell
            "5": "Gub5qCTutZo",  # Tesla
            "6": "AeznZIbgXhk",  # Walmart
        }
        video_id = VIDEO_ID_MAPPINGS.get(dashboard_id)
        if video_id:
            return video_id  # Return raw ID without prefix
    
    return None

def generate_job_id() -> str:
    """Generate unique job ID"""
    return f"job_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

def get_script_path(script_name: str) -> str:
    """Get absolute path to script"""
    # Assumes scripts are in same directory as this API file
    script_dir = Path(__file__).parent
    script_path = script_dir / script_name
    if not script_path.exists():
        raise FileNotFoundError(f"Script not found: {script_path}")
    return str(script_path)

async def run_analysis_script(
    job_id: str,
    script_name: str,
    analysis_type: str,
    request: AnalysisRequest
):
    """Run analysis script in background"""
    try:
        jobs[job_id]["status"] = "running"
        
        # Build command
        script_path = get_script_path(script_name)
        cmd = [
            "python3",
            script_path,
            "--input-file", request.input_file,
            "--batch-size", str(request.batch_size),
            "--ma-window", str(request.ma_window),
        ]
        
        if request.output_file:
            cmd.extend(["--output-file", request.output_file])
        
        if request.track_metadata:
            cmd.append("--track-metadata")
        
        # Run script
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
            
            # Extract output filename from stdout if auto-generated
            if not request.output_file:
                # Parse output to find the uploaded file path
                output_text = stdout.decode('utf-8')
                for line in output_text.split('\n'):
                    if 'Uploaded:' in line and analysis_type in line:
                        # Extract filename from output
                        parts = line.split('at ')
                        if len(parts) > 1:
                            output_file = parts[1].strip()
                            jobs[job_id]["output_file"] = output_file
                            break
        else:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = stderr.decode('utf-8')
            jobs[job_id]["completed_at"] = datetime.now().isoformat()
    
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completed_at"] = datetime.now().isoformat()


# API Endpoints

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Sentiment Analysis API",
        "version": "1.0.0",
        "supabase_connected": supabase is not None
    }

@app.post("/analyze/specificity", response_model=AnalysisResponse)
async def analyze_specificity(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Run specificity analysis on a transcript
    """
    job_id = generate_job_id()
    
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "analysis_type": "specificity",
        "input_file": request.input_file,
        "output_file": request.output_file,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "error": None
    }
    
    # Run analysis in background
    background_tasks.add_task(
        run_analysis_script,
        job_id,
        "text_insights_specific.py",
        "specificity",
        request
    )
    
    return AnalysisResponse(
        job_id=job_id,
        status="pending",
        message="Specificity analysis started",
        output_file=request.output_file
    )

@app.post("/analyze/relevance", response_model=AnalysisResponse)
async def analyze_relevance(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Run relevance analysis on a transcript
    """
    job_id = generate_job_id()
    
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "analysis_type": "relevance",
        "input_file": request.input_file,
        "output_file": request.output_file,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "error": None
    }
    
    # Run analysis in background
    background_tasks.add_task(
        run_analysis_script,
        job_id,
        "text_insights_relevant.py",
        "relevance",
        request
    )
    
    return AnalysisResponse(
        job_id=job_id,
        status="pending",
        message="Relevance analysis started",
        output_file=request.output_file
    )

@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """
    Get status of an analysis job
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatus(**jobs[job_id])

@app.get("/jobs", response_model=List[JobStatus])
async def list_jobs():
    """
    List all jobs
    """
    return [JobStatus(**job) for job in jobs.values()]

@app.get("/transcripts", response_model=List[FileInfo])
async def list_transcripts():
    """
    List all files in the transcripts bucket
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        files = supabase.storage.from_("transcripts").list()
        
        return [
            FileInfo(
                name=f.get("name"),
                size=f.get("metadata", {}).get("size"),
                created_at=f.get("created_at"),
                updated_at=f.get("updated_at")
            )
            for f in files
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list transcripts: {str(e)}")

@app.get("/sentiment", response_model=List[FileInfo])
async def list_sentiment_files():
    """
    List all files in the sentiment bucket
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        files = supabase.storage.from_("sentiment").list()
        
        return [
            FileInfo(
                name=f.get("name"),
                size=f.get("metadata", {}).get("size"),
                created_at=f.get("created_at"),
                updated_at=f.get("updated_at")
            )
            for f in files
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sentiment files: {str(e)}")

# Specific routes must come BEFORE catch-all /{filename} routes
@app.get("/sentiment/get-by-video", response_model=VideoSentimentResponse)
async def get_sentiment_by_video_get(
    video_url: Optional[str] = None,
    video_id: Optional[str] = None,
    dashboard_id: Optional[str] = None
):
    """
    GET endpoint: Get sentiment data for a video by video_url, video_id, or dashboard_id.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    # If video_id is provided directly (e.g., "L2pr_J40754"), use it as-is
    if video_id:
        video_identifier = video_id
    else:
        # Otherwise normalize from dashboard_id or video_url
        video_identifier = normalize_video_identifier(dashboard_id, video_url)
    
    # Call the internal helper - defined later in the file
    return await _get_sentiment_data_by_identifier(video_identifier)

@app.get("/sentiment/{filename}")
async def get_sentiment_file(filename: str):
    """
    Download a specific result file from sentiment bucket
    Returns the CSV file as a download
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Download file from Supabase
        data = supabase.storage.from_("sentiment").download(filename)
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(data),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")

@app.get("/sentiment/{filename}/data")
async def get_sentiment_data(filename: str):
    """
    Get result file data as JSON (for frontend visualization)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Download file from Supabase
        data = supabase.storage.from_("sentiment").download(filename)
        
        # Parse CSV
        csv_text = data.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_text))
        
        rows = []
        for row in csv_reader:
            # Convert numeric fields
            processed_row = {}
            for key, value in row.items():
                if value == '' or value == 'None':
                    processed_row[key] = None
                elif key in ['sentence_index', 'label_id']:
                    processed_row[key] = int(value) if value else None
                elif key in ['score', 'specificity_0_1', 'specificity_-1_1', 'ma_specificity_0_1',
                           'relevance_0_1', 'relevance_-1_1', 'ma_relevance_0_1']:
                    processed_row[key] = float(value) if value else None
                else:
                    processed_row[key] = value
            rows.append(processed_row)
        
        return {
            "filename": filename,
            "total_sentences": len(rows),
            "data": rows
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to read file: {str(e)}")

@app.delete("/sentiment/{filename}")
async def delete_sentiment_file(filename: str):
    """
    Delete a result file from sentiment bucket
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        supabase.storage.from_("sentiment").remove([filename])
        return {"message": f"Deleted {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

@app.post("/sentiment/get-by-video", response_model=VideoSentimentResponse)
async def get_sentiment_by_video(request: VideoSentimentRequest):
    """
    POST endpoint: Get sentiment data (relevance and specificity) for a video by looking it up in the database.
    Uses dashboard_id or video_url to find the corresponding analysis files.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    # Normalize to video identifier
    video_identifier = normalize_video_identifier(request.dashboard_id, request.video_url)
    
    return await _get_sentiment_data_by_identifier(video_identifier)

async def _get_sentiment_data_by_identifier(video_identifier: Optional[str]) -> VideoSentimentResponse:
    """Internal function to get sentiment data by video identifier."""
    if not video_identifier:
        raise HTTPException(status_code=400, detail="Must provide either dashboard_id or video_url")
    
    try:
        # Look up in database
        result = supabase.table("video_analyses").select("*").eq("video_identifier", video_identifier).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Video analysis not found for identifier: {video_identifier}")
        
        record = result.data[0]
        relevance_filename = record.get("relevance_filename")
        specificity_filename = record.get("specificity_filename")
        
        if not relevance_filename or not specificity_filename:
            raise HTTPException(
                status_code=404, 
                detail=f"Analysis incomplete for {video_identifier}. Missing relevance or specificity files."
            )
        
        # Fetch both data files using existing endpoint logic
        try:
            # Relevance data
            relevance_data_raw = supabase.storage.from_("sentiment").download(relevance_filename)
            relevance_csv = relevance_data_raw.decode('utf-8')
            relevance_reader = csv.DictReader(io.StringIO(relevance_csv))
            relevance_rows = []
            for row in relevance_reader:
                processed_row = {}
                for key, value in row.items():
                    if value == '' or value == 'None':
                        processed_row[key] = None
                    elif key in ['sentence_index', 'label_id']:
                        processed_row[key] = int(value) if value else None
                    elif key in ['score', 'relevance_0_1', 'relevance_-1_1', 'ma_relevance_0_1']:
                        processed_row[key] = float(value) if value else None
                    else:
                        processed_row[key] = value
                relevance_rows.append(processed_row)
            
            # Specificity data
            specificity_data_raw = supabase.storage.from_("sentiment").download(specificity_filename)
            specificity_csv = specificity_data_raw.decode('utf-8')
            specificity_reader = csv.DictReader(io.StringIO(specificity_csv))
            specificity_rows = []
            for row in specificity_reader:
                processed_row = {}
                for key, value in row.items():
                    if value == '' or value == 'None':
                        processed_row[key] = None
                    elif key in ['sentence_index', 'label_id']:
                        processed_row[key] = int(value) if value else None
                    elif key in ['score', 'specificity_0_1', 'specificity_-1_1', 'ma_specificity_0_1']:
                        processed_row[key] = float(value) if value else None
                    else:
                        processed_row[key] = value
                specificity_rows.append(processed_row)
            
            return VideoSentimentResponse(
                relevance_data={
                    "filename": relevance_filename,
                    "total_sentences": len(relevance_rows),
                    "data": relevance_rows
                },
                specificity_data={
                    "filename": specificity_filename,
                    "total_sentences": len(specificity_rows),
                    "data": specificity_rows
                },
                video_identifier=video_identifier
            )
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read analysis files: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sentiment data: {str(e)}")


@app.get("/library")
async def get_library():
    """Get all video analyses for library display (excludes preloaded dashboards)"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    # Preloaded dashboard video IDs that should be hidden from library
    PRELOADED_VIDEO_IDS = {
        "dC9yOuhiNrk",  # Apple (Dashboard 1)
        "8K4aHLrekqQ",  # CVS (Dashboard 2)
        "URIsVKPmhGg",  # Google/Alphabet (Dashboard 3)
        "fouFNKTDPmk",  # Shell (Dashboard 4)
        "Gub5qCTutZo",  # Tesla (Dashboard 5)
        "AeznZIbgXhk",  # Walmart (Dashboard 6)
    }
    
    try:
        result = supabase.table("video_analyses").select("*").execute()
        
        # Filter out preloaded calls and add metadata
        filtered_videos = []
        for video in result.data:
            # Skip preloaded dashboards
            if video.get('video_identifier') in PRELOADED_VIDEO_IDS:
                continue
            
            if 'metadata' not in video or not video['metadata']:
                # Extract ticker from filename if possible (e.g., "nvda_...")
                filename = video.get('transcript_filename', '')
                ticker = filename.split('_')[0].upper() if '_' in filename else 'N/A'
                
                video['metadata'] = {
                    'title': f"{ticker} Earnings Call",
                    'ticker': ticker
                }
            
            filtered_videos.append(video)
        
        return {"videos": filtered_videos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch library: {str(e)}")

@app.delete("/library/{video_identifier}")
async def delete_from_library(video_identifier: str):
    """Delete a video analysis from the library"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Get the record first to find file names
        result = supabase.table("video_analyses").select("*").eq("video_identifier", video_identifier).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Video not found")
        
        record = result.data[0]
        
        # Delete associated files from storage
        try:
            if record.get("transcript_filename"):
                supabase.storage.from_("transcripts").remove([record["transcript_filename"]])
            if record.get("relevance_filename"):
                supabase.storage.from_("sentiment").remove([record["relevance_filename"]])
            if record.get("specificity_filename"):
                supabase.storage.from_("sentiment").remove([record["specificity_filename"]])
        except Exception as e:
            print(f"Warning: Could not delete some files: {e}")
        
        # Delete the database record
        supabase.table("video_analyses").delete().eq("video_identifier", video_identifier).execute()
        
        return {"message": f"Deleted {video_identifier}", "success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)