# api_chatbot.py
from fastapi import FastAPI, Query, Body, HTTPException
from pydantic import BaseModel
from transcript_retrieval import get_video_transcript, save_transcript_as_txt
from langchain_testing import initialize_retrieval, get_chat_response, generate_follow_up_questions
from langchain.memory import ConversationBufferMemory
import os
from datetime import datetime
from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import ChatPromptTemplate
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from typing import Optional
import subprocess
import json
import re
from dotenv import load_dotenv
from supabase import create_client
from fastapi.middleware.cors import CORSMiddleware

from llm_provider import get_llm, run_with_fallback, is_quota_error, mark_openai_unavailable, get_active_provider

# Load environment variables and initialize Supabase
load_dotenv()
supabase = None
try:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        print("✅ Supabase connected")
    else:
        print("⚠️  Supabase not configured")
except Exception as e:
    print(f"⚠️  Failed to initialize Supabase: {e}")

last_used_id = None  # NEW: track last dashboard id


app = FastAPI()

# Import and include the dashboard creation endpoint
try:
    from create_dashboard_endpoint import router as dashboard_router
    app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
except ImportError as e:
    print(f"Warning: Could not import dashboard creation endpoint: {e}")

# Add this block to enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://simpli-earn-2-simpli-earns-projects.vercel.app", "https://simpli-earn-2.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000"],  # Allow all origins for dev; tighten in prod
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Persistent objects
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
retriever = None
qa_chain = None  # ✅ NEW
summary_chain = None  # ✅ For generating one-off summaries

# Static transcripts for library
STATIC_TRANSCRIPTS = {
    "1": "transcripts/apple_seeking_alpha.txt",
    "2": "transcripts/cvs_seeking_alpha.txt",
    "3": "transcripts/alphabet_seeking_alpha.txt",
    "4": "transcripts/shell_seeking_alpha.txt",
    "5": "transcripts/tesla_seeking_alpha.txt",
    "6": "transcripts/walmart_seeking_alpha.txt",
    # Apple historical quarters (from Alpha Vantage)
    "aapl_2024Q4": "transcripts/apple_2024Q4_seeking_alpha.txt",
    "aapl_2024Q3": "transcripts/apple_2024Q3_seeking_alpha.txt",
    "aapl_2024Q2": "transcripts/apple_2024Q2_seeking_alpha.txt",
    "aapl_2024Q1": "transcripts/apple_2024Q1_seeking_alpha.txt",
    "aapl_2023Q4": "transcripts/apple_2023Q4_seeking_alpha.txt",
}

UPLOADS_DIR = "uploads"
chat_history = []

class ChatRequest(BaseModel):
    message: str
    id: Optional[str] = None
    video_url: Optional[str] = None

def save_transcript_in_uploads(video_url, transcript_text):
    """Save transcript to the uploads folder with a timestamped filename."""
    today = datetime.now().strftime("%Y-%m-%d")
    upload_dir = os.path.join(UPLOADS_DIR, today)
    os.makedirs(upload_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%H-%M-%S")
    transcript_filename = f"youtube_transcript_{timestamp}.txt"
    file_path = os.path.join(upload_dir, transcript_filename)
    save_transcript_as_txt(transcript_text, file_path)
    return file_path

@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    global retriever, qa_chain, memory, last_used_id

    # Always clear memory and retriever if either source (id or video_url) changed
    source_changed = False

    if req.video_url:
        # Switching from preloaded to YouTube or new video
        if last_used_id != f"YT::{req.video_url}":
            source_changed = True
            last_used_id = f"YT::{req.video_url}"

    elif req.id:
        # Switching from YouTube to preloaded or to different preloaded ID
        if last_used_id != req.id:
            source_changed = True
            last_used_id = req.id

    if source_changed:
        memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
        retriever = None
        qa_chain = None

    # Load transcript depending on source
    if req.video_url and not retriever:
        # Extract video ID from URL
        video_id = None
        if "v=" in req.video_url:
            video_id = req.video_url.split("v=")[1].split("&")[0]
        
        # Try to get transcript from Supabase first
        transcript_path = None
        if video_id and supabase:
            try:
                result = supabase.table("video_analyses").select("transcript_filename").eq("video_identifier", video_id).execute()
                
                if result.data and len(result.data) > 0:
                    transcript_filename = result.data[0].get("transcript_filename")
                    if transcript_filename:
                        # Download and save transcript locally
                        print(f"📥 Downloading transcript from Supabase: {transcript_filename}")
                        transcript_data = supabase.storage.from_("transcripts").download(transcript_filename)
                        transcript_text = transcript_data.decode('utf-8')
                        
                        # Save to local file for retrieval
                        upload_dir = os.path.join(os.getcwd(), "uploads")
                        os.makedirs(upload_dir, exist_ok=True)
                        transcript_path = os.path.join(upload_dir, f"transcript_{video_id}.txt")
                        with open(transcript_path, "w", encoding="utf-8") as f:
                            f.write(transcript_text)
                        print(f"✅ Transcript saved locally: {transcript_path}")
            except Exception as e:
                print(f"⚠️  Failed to load transcript from Supabase: {e}")
        
        # Fallback to YouTube if not in Supabase
        if not transcript_path:
            print("📥 Fetching transcript from YouTube...")
            transcript = get_video_transcript(req.video_url)
            if "Error:" in transcript:
                return {"response": transcript}
            transcript_path = save_transcript_in_uploads(req.video_url, transcript)
        
        retriever, _ = initialize_retrieval(transcript_path)

    elif req.id and not retriever:
        if req.id in STATIC_TRANSCRIPTS:
            transcript_path = STATIC_TRANSCRIPTS[req.id]
            retriever, _ = initialize_retrieval(transcript_path)
        else:
            return {"response": "❌ Unknown dashboard ID or missing transcript."}

    if not retriever:
        return {"response": "❌ No transcript loaded. Provide video_url or valid id."}

    chat_prompt = ChatPromptTemplate.from_template(
        """
        You are a financial assistant providing insights from this transcript of an earnings call you currently have.
        You are to give objective answers at all times.
        This document is the earnings call of a given company, and it will have typical information such as the name of the company, the participants at the start of the document.
        Use the provided context and chat history to answer the user's questions.
        If the question is irrelevant to the document, politely state so.
        Assume the user is not a financial expert.
        If the user states anything unrelated to the earnings call (need not be a question), please do not answer it and let them know that you are only allowed to answer questions and provide information of the given earnings call.
        Do not start your response by citing the transcript of the call.

        Context: {context}
        Chat History: {chat_history}
        User: {question}
        Assistant:
        """
    )

    def _build_qa_chain():
        global qa_chain
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=get_llm(),
            retriever=retriever,
            memory=memory,
            combine_docs_chain_kwargs={"prompt": chat_prompt}
        )

    if qa_chain is None:
        _build_qa_chain()

    def _invoke():
        return qa_chain.invoke({"question": req.message})

    try:
        response = run_with_fallback(_invoke, rebuild_fn=_build_qa_chain)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service error: {e}")

    chat_history.append({"question": req.message, "answer": response["answer"]})

    suggestions = generate_follow_up_questions(
        user_question=req.message,
        bot_answer=response["answer"],
        chat_history=chat_history,
        retriever=retriever
    )

    return {"response": response["answer"], "suggestions": suggestions, "provider": get_active_provider()}



@app.get("/summary")
def generate_summary(id: str = Query("1")):
    """For preloaded dashboards (1-6): return static summary from codebase. No DB or OpenAI."""
    from static_summaries import STATIC_SUMMARIES

    if id not in STATIC_TRANSCRIPTS:
        return {"summary": "❌ Unknown dashboard ID or missing transcript."}

    # IDs 1-6: serve static summaries directly (fast, no DB/API)
    if id in STATIC_SUMMARIES and STATIC_SUMMARIES[id]:
        return {"summary": STATIC_SUMMARIES[id], "provider": "static"}

    # Static summary not yet populated
    return {
        "summary": "❌ Static summary not yet generated. Run from project root: python scripts/populate_preloaded_summaries.py",
        "provider": None,
    }


@app.post("/summary")
def generate_summary_from_youtube(data: dict = Body(...)):
    video_url = data.get("video_url")
    if not video_url:
        return {"summary": "❌ No video URL provided."}

    # Extract video ID from URL
    video_id = None
    if "v=" in video_url:
        video_id = video_url.split("v=")[1].split("&")[0]
    
    # Try to get transcript from Supabase first
    transcript_text = None
    if video_id and supabase:
        try:
            # Check database for this video
            result = supabase.table("video_analyses").select("transcript_filename").eq("video_identifier", video_id).execute()
            
            if result.data and len(result.data) > 0:
                transcript_filename = result.data[0].get("transcript_filename")
                if transcript_filename:
                    # Download transcript from Supabase
                    print(f"📥 Downloading transcript from Supabase: {transcript_filename}")
                    transcript_data = supabase.storage.from_("transcripts").download(transcript_filename)
                    transcript_text = transcript_data.decode('utf-8')
                    print(f"✅ Transcript loaded from Supabase ({len(transcript_text)} chars)")
        except Exception as e:
            print(f"⚠️  Failed to load transcript from Supabase: {e}")
    
    # Fallback to YouTube if not in Supabase
    if not transcript_text:
        print("📥 Fetching transcript from YouTube...")
        transcript = get_video_transcript(video_url)
        if "Error:" in transcript:
            return {"summary": transcript}

        transcript_path = save_transcript_in_uploads(video_url, transcript)

        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                transcript_text = f.read()
        except Exception as e:
            return {"summary": f"❌ Failed to read transcript: {str(e)}"}

    post_summary_prompt = PromptTemplate(
        input_variables=["transcript"],
        template="""
You are a financial analyst assistant. Read the following earnings call transcript and generate a summary highlighting the key financial results, executive commentary, and any forward-looking statements.
Don't make it too long and do not use complicated financial terminology, assume the user has little knowledge of finance. 
If you do want to use complicated terminology/jargon please do define it as well/explain it so it is clear for the user.

Transcript:
{transcript}

Summary:
"""
    )

    global summary_chain
    def _build_yt_summary():
        global summary_chain
        summary_chain = LLMChain(llm=get_llm(), prompt=post_summary_prompt)

    if summary_chain is None:
        _build_yt_summary()

    try:
        result = run_with_fallback(
            lambda: summary_chain.run(transcript=transcript_text),
            rebuild_fn=_build_yt_summary,
        )
        return {"summary": result, "provider": get_active_provider()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service error: {e}")


HIGH_SIGNAL_WORDS = [
    "AI", "headwinds", "margins", "recession", "growth",
    "guidance", "uncertainty", "challenges", "record", "supply chain"
]

class CompareRequest(BaseModel):
    current_id: str
    previous_id: str

@app.post("/compare")
def compare_transcripts(req: CompareRequest):
    if req.current_id not in STATIC_TRANSCRIPTS:
        return {"error": f"Unknown current_id: {req.current_id}"}
    if req.previous_id not in STATIC_TRANSCRIPTS:
        return {"error": f"Unknown previous_id: {req.previous_id}"}

    try:
        with open(STATIC_TRANSCRIPTS[req.current_id], "r", encoding="utf-8") as f:
            current_text = f.read()
        with open(STATIC_TRANSCRIPTS[req.previous_id], "r", encoding="utf-8") as f:
            previous_text = f.read()
    except Exception as e:
        return {"error": f"Failed to read transcripts: {str(e)}"}

    # Count high-signal word occurrences (case-insensitive)
    def count_words(text):
        text_lower = text.lower()
        return {word: text_lower.count(word.lower()) for word in HIGH_SIGNAL_WORDS}

    word_counts = {
        "current": count_words(current_text),
        "previous": count_words(previous_text),
    }

    # Single GPT-4o call with structured difference prompt
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    prompt = f"""You are a financial analyst. You are given two earnings call transcripts.

TRANSCRIPT A (current): {current_text[:6000]}
TRANSCRIPT B (previous): {previous_text[:6000]}

Return a JSON object with exactly these fields:
- "sentiment_current": integer 1-10 (overall confidence/positivity of transcript A)
- "sentiment_previous": integer 1-10 (overall confidence/positivity of transcript B)
- "narrative_shifts": list of exactly 3 strings, each describing a specific contradiction or strategic pivot between the two calls. Be concrete.
- "current_label": short label for transcript A (e.g. "Apple Q1 FY2025")
- "previous_label": short label for transcript B (e.g. "Tesla Q4 2024")

Return only the JSON object, no other text."""

    try:
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        raw = completion.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        gpt_data = json.loads(raw)
    except Exception as e:
        return {"error": f"GPT parse failure: {str(e)}"}

    sentiment_current = int(gpt_data.get("sentiment_current", 5))
    sentiment_previous = int(gpt_data.get("sentiment_previous", 5))
    delta = sentiment_current - sentiment_previous

    return {
        "current_label": gpt_data.get("current_label", "Current"),
        "previous_label": gpt_data.get("previous_label", "Previous"),
        "sentiment": {
            "current": sentiment_current,
            "previous": sentiment_previous,
            "delta": delta,
            "direction": "up" if delta > 0 else ("down" if delta < 0 else "flat"),
        },
        "word_counts": word_counts,
        "narrative_shifts": gpt_data.get("narrative_shifts", []),
    }


# --- Red Flag Detection ---
VIDEO_ID_MAPPINGS = {
    "1": "dC9yOuhiNrk", "2": "8K4aHLrekqQ", "3": "URIsVKPmhGg",
    "4": "fouFNKTDPmk", "5": "Gub5qCTutZo", "6": "AeznZIbgXhk",
}

def _normalize_video_id(dashboard_id: Optional[str], video_url: Optional[str]) -> Optional[str]:
    if video_url and "v=" in video_url:
        return video_url.split("v=")[1].split("&")[0]
    if video_url and "youtu.be/" in video_url:
        return video_url.split("youtu.be/")[1].split("?")[0]
    return VIDEO_ID_MAPPINGS.get(str(dashboard_id or "")) if dashboard_id else None

@app.post("/red-flags")
def get_red_flags(data: dict = Body(...)):
    """Detect red flags in earnings call transcript. Returns list of {sentence_index, quote, category, severity, description}."""
    dashboard_id = data.get("dashboard_id")
    video_url = data.get("video_url")
    video_id = _normalize_video_id(dashboard_id, video_url)
    if not video_id or not supabase:
        return {"red_flags": [], "error": "Missing video identifier or Supabase"}

    try:
        result = supabase.table("video_analyses").select("relevance_filename").eq("video_identifier", video_id).execute()
        if not result.data or len(result.data) == 0:
            return {"red_flags": [], "error": "Video analysis not found"}

        rel_file = result.data[0].get("relevance_filename")
        if not rel_file:
            return {"red_flags": []}

        raw = supabase.storage.from_("sentiment").download(rel_file)
        import io
        import csv
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8")))
        sentences = []
        for row in reader:
            idx = int(row.get("sentence_index", len(sentences)))
            text = row.get("sentence_text", "").strip()
            if text:
                sentences.append({"sentence_index": idx, "sentence_text": text})

        if not sentences:
            return {"red_flags": []}

        # Build numbered transcript for GPT
        numbered = "\n".join([f"[{s['sentence_index']}] {s['sentence_text']}" for s in sentences[:500]])

        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "system",
                "content": """You are a financial analyst. Analyze earnings call transcripts for RED FLAGS that could concern investors.
Return JSON: {"red_flags": [{"sentence_index": int, "quote": "exact quote", "category": string, "severity": "high"|"medium"|"low", "description": "brief explanation"}]}.
Categories: vague_evasive, guidance_change, margin_pressure, regulatory_legal, management_change, debt_leverage, other.
Only include genuine concerns. Be conservative - max 12 flags. Use sentence_index from the transcript. Return valid JSON only."""
            }, {
                "role": "user",
                "content": f"Earnings call transcript (sentence_index, text):\n\n{numbered}"
            }],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        out = json.loads(resp.choices[0].message.content)
        flags = out.get("red_flags", out.get("flags", []))
        if isinstance(flags, dict):
            flags = list(flags.values()) if isinstance(next(iter(flags.values()), None), dict) else []
        return {"red_flags": flags[:15]}
    except Exception as e:
        print(f"Red flags error: {e}")
        return {"red_flags": [], "error": str(e)}


@app.post("/generate-stock")
def generate_stock(payload: dict):
    ticker = payload.get("ticker")
    date = payload.get("date")

    if not ticker or not date:
        return {"error": "ticker and date required"}

    process = subprocess.Popen(
        ["python3", "stockchartgenerationV2.py", ticker, date],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=os.environ
    )
    out, err = process.communicate(timeout=30)

    if process.returncode != 0:
        return {"error": err}

    try:
        return json.loads(out)
    except Exception as e:
        return {"error": "Failed to parse JSON", "details": str(e), "raw": out}


@app.post("/generate-indicators")
def generate_indicators(payload: dict = Body(...)):
    """Generate economic indicators (VIX, TNX, DXY) data for the given time window."""
    start_local = payload.get("startLocal")
    hours = payload.get("hours", 48)
    interval = payload.get("interval", "5m")
    indicators = payload.get("indicators", ["VIX", "TNX", "DXY"])

    if not start_local:
        return {"ok": False, "error": "startLocal required"}

    # Date format conversion: MM/DD/YY HH:MM -> YYYY-MM-DD HH:MM
    formatted_date = start_local
    if "/" in start_local:
        parts = start_local.strip().split(" ")
        date_part = parts[0]
        time_part = parts[1] if len(parts) > 1 else "09:30"
        m, d, y = date_part.split("/")
        full_year = f"20{y}" if int(y) < 50 else f"19{y}"
        formatted_date = f"{full_year}-{m.zfill(2)}-{d.zfill(2)} {time_part}"

    from economicIndicatorsV2 import get_economic_indicators_json
    return get_economic_indicators_json(formatted_date, hours, interval, indicators)