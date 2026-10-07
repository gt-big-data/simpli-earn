# api_chatbot.py
from fastapi import FastAPI, Query, Body, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from transcript_retrieval import get_video_transcript, get_video_transcript_entries, save_transcript_as_txt, extract_video_id
from langchain_testing import initialize_retrieval, answer_question, generate_follow_up_questions
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
from datetime import datetime
from pathlib import Path
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from typing import Optional
from collections import Counter
import subprocess
import json
import re
import threading
import uuid
from dotenv import load_dotenv
from supabase import create_client

from fastapi.middleware.cors import CORSMiddleware

from chat_sessions import ChatSessionStore, normalize_conversation_id
from env_check import validate_environment
from llm_provider import get_llm, run_with_fallback, get_active_provider, get_model_name, invoke_json

# Load environment variables and initialize Supabase
load_dotenv()
validate_environment()
supabase = None
try:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        print("âœ… Supabase connected")
    else:
        print("âš ï¸  Supabase not configured")
except Exception as e:
    print(f"âš ï¸  Failed to initialize Supabase: {e}")

app = FastAPI()

try:
    from create_dashboard_endpoint import router as dashboard_router
    app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
except ImportError as e:
    print(f"Warning: Could not import dashboard creation endpoint: {e}")

DEFAULT_CORS_ORIGINS = [
    "https://simpli-earn-2-simpli-earns-projects.vercel.app",
    "https://simpli-earn-2.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def cors_origins(env=None) -> list[str]:
    """
    Browser origins allowed to call this API: the defaults plus CORS_ALLOWED_ORIGINS
    (comma-separated). cloudbuild.yaml adds the Cloud Run frontend's URLs there on each deploy.
    """
    env = os.environ if env is None else env
    extra = [origin.strip().rstrip("/") for origin in (env.get("CORS_ALLOWED_ORIGINS") or "").split(",")]
    return list(dict.fromkeys(DEFAULT_CORS_ORIGINS + [origin for origin in extra if origin]))


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_sessions = ChatSessionStore()

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

PRELOADED_VIDEOS_PATH = Path(__file__).resolve().parent.parent / "frontend" / "lib" / "preloaded_videos.json"
with open(PRELOADED_VIDEOS_PATH, "r", encoding="utf-8") as f:
    PRELOADED_VIDEOS = json.load(f)

PRELOADED_SUMMARY_ANCHORS_PATH = Path(__file__).resolve().parent / "preloaded_summary_anchors.json"
with open(PRELOADED_SUMMARY_ANCHORS_PATH, "r", encoding="utf-8") as f:
    PRELOADED_SUMMARY_ANCHORS = json.load(f)

UPLOADS_DIR = "uploads"


class ChatRequest(BaseModel):
    message: str
    id: Optional[str] = None
    video_url: Optional[str] = None
    # Client-generated id that scopes chat history; one is minted (and returned) if missing
    conversation_id: Optional[str] = None


STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in",
    "is", "it", "its", "of", "on", "or", "that", "the", "their", "this", "to",
    "was", "were", "will", "with", "also", "into", "than", "year", "quarter",
    "company", "continued", "overall",
}


def strip_markdown(text: str) -> str:
    return re.sub(r"\*\*(.*?)\*\*", r"\1", text)


def normalize_for_matching(text: str) -> str:
    cleaned = strip_markdown(text).lower()
    cleaned = re.sub(r"[^a-z0-9$%.\s]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def tokenize_for_matching(text: str) -> list[str]:
    return [
        token for token in normalize_for_matching(text).split()
        if len(token) > 1 and token not in STOP_WORDS
    ]


def build_transcript_chunks(transcript_entries: list[dict], window_size: int = 6, step: int = 3) -> list[dict]:
    if not transcript_entries:
        return []

    chunks = []
    total_entries = len(transcript_entries)

    for start_index in range(0, total_entries, step):
        window = transcript_entries[start_index:start_index + window_size]
        if not window:
            continue

        text = " ".join(
            entry.get("text", "").strip()
            for entry in window
            if entry.get("text")
        ).strip()
        if not text:
            continue

        chunks.append({
            "text": text,
            "start": window[0].get("start"),
            "tokens": tokenize_for_matching(text),
            "normalized": normalize_for_matching(text),
        })

        if start_index + window_size >= total_entries:
            break

    return chunks


def find_best_chunk_start(summary_text: str, transcript_chunks: list[dict]) -> Optional[int]:
    summary_tokens = tokenize_for_matching(summary_text)
    if not summary_tokens or not transcript_chunks:
        return None

    summary_counts = Counter(summary_tokens)
    summary_token_set = set(summary_tokens)
    normalized_summary = normalize_for_matching(summary_text)

    best_chunk = None
    best_score = 0.0

    for chunk in transcript_chunks:
        chunk_tokens = chunk.get("tokens", [])
        if not chunk_tokens:
            continue

        chunk_counts = Counter(chunk_tokens)
        overlap = summary_token_set & set(chunk_tokens)
        if not overlap:
            continue

        overlap_score = sum(min(summary_counts[token], chunk_counts[token]) for token in overlap)
        density_score = overlap_score / max(len(summary_token_set), 1)

        phrase_bonus = 0.0
        if normalized_summary and normalized_summary in chunk.get("normalized", ""):
            phrase_bonus += 3.0
        elif len(overlap) >= 3:
            phrase_bonus += 1.0

        numeric_bonus = 0.0
        numeric_tokens = [token for token in summary_tokens if any(char.isdigit() for char in token) or "$" in token or "%" in token]
        if numeric_tokens:
            numeric_overlap = sum(1 for token in numeric_tokens if token in chunk_counts)
            numeric_bonus = numeric_overlap * 1.5

        score = overlap_score + density_score + phrase_bonus + numeric_bonus
        if score > best_score:
            best_score = score
            best_chunk = chunk

    if not best_chunk or best_score < 2.5:
        return None

    start_time = best_chunk.get("start")
    return int(start_time) if start_time is not None else None


def build_summary_sections(summary_text: str, transcript_entries: list[dict]) -> list[dict]:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", summary_text) if block.strip()]
    if not blocks:
        return []

    items = []
    pending_heading: Optional[str] = None

    def append_item(text: str, *, bullet: bool, heading: Optional[str] = None):
        cleaned_text = text.strip()
        if not cleaned_text:
            return
        items.append({
            "heading": heading,
            "text": cleaned_text,
            "bullet": bullet,
        })

    def normalize_inline_text(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    def extract_bullet_segments(block: str) -> tuple[Optional[str], list[dict]]:
        matches = list(re.finditer(r"(?m)^(\s*)-\s+", block))
        if not matches:
            return None, []

        prefix = block[:matches[0].start()].strip() or None
        segments = []
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
            raw_segment = block[start:end].strip("\n")
            lines = raw_segment.splitlines()
            first_line = re.sub(r"^\s*-\s+", "", lines[0]).strip()
            continuation = [line.strip() for line in lines[1:] if line.strip()]
            text = normalize_inline_text(" ".join([first_line, *continuation]))
            segments.append({
                "indent": len(match.group(1)),
                "text": text,
            })
        return prefix, segments

    for block in blocks:
        prefix_heading, bullet_segments = extract_bullet_segments(block)
        if bullet_segments:
            if prefix_heading:
                pending_heading = prefix_heading

            min_indent = min(segment["indent"] for segment in bullet_segments)
            active_heading = pending_heading
            child_heading = None
            child_indent = None
            first_item_in_block = True

            for index, segment in enumerate(bullet_segments):
                indent = segment["indent"]
                text = segment["text"]
                next_indent = bullet_segments[index + 1]["indent"] if index + 1 < len(bullet_segments) else None

                if indent == min_indent:
                    child_heading = None
                    child_indent = None

                    if text.endswith(":") and next_indent is not None and next_indent > indent:
                        child_heading = text
                        child_indent = next_indent
                        continue

                    append_item(text, bullet=True, heading=active_heading if first_item_in_block else None)
                    active_heading = None
                    first_item_in_block = False
                    continue

                if child_heading and child_indent is not None and indent >= child_indent:
                    append_item(text, bullet=True, heading=child_heading if first_item_in_block else None)
                    active_heading = None
                    first_item_in_block = False
                    continue

                append_item(text, bullet=True, heading=active_heading if first_item_in_block else None)
                active_heading = None
                first_item_in_block = False

            pending_heading = None
            continue

        if block.endswith(":"):
            pending_heading = block
            continue

        append_item(block, bullet=False, heading=pending_heading)
        pending_heading = None

    if not items:
        return []

    transcript_chunks = build_transcript_chunks(transcript_entries)

    if not transcript_entries:
        return [{**item, "timestamp": None} for item in items]

    return [
        {
            "heading": item["heading"],
            "text": item["text"],
            "bullet": item["bullet"],
            "timestamp": find_best_chunk_start(item["text"], transcript_chunks) if item["bullet"] else None,
        }
        for item in items
    ]


def apply_preloaded_anchors(summary_sections: list[dict], dashboard_id: str) -> list[dict]:
    anchor_entries = PRELOADED_SUMMARY_ANCHORS.get(dashboard_id, [])
    if not anchor_entries:
        return summary_sections

    bullet_index = 0
    anchored_sections = []

    for section in summary_sections:
        anchored_section = dict(section)
        if section.get("bullet"):
            anchor = anchor_entries[bullet_index] if bullet_index < len(anchor_entries) else None
            anchored_section["timestamp"] = anchor.get("timestamp") if anchor else None
            bullet_index += 1
        anchored_sections.append(anchored_section)

    return anchored_sections


def save_transcript_in_uploads(video_url, transcript_text):
    today = datetime.now().strftime("%Y-%m-%d")
    upload_dir = os.path.join(UPLOADS_DIR, today)
    os.makedirs(upload_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%H-%M-%S")
    transcript_filename = f"youtube_transcript_{timestamp}.txt"
    file_path = os.path.join(upload_dir, transcript_filename)
    save_transcript_as_txt(transcript_text, file_path)
    return file_path


def _chat_source_key(req: ChatRequest) -> Optional[str]:
    if req.video_url:
        return f"YT::{req.video_url}"
    if req.id:
        return f"ID::{req.id}"
    return None


# Transcripts are public call data, so local copies are shared across conversations
_chat_transcripts: dict[str, str] = {}
_chat_transcripts_lock = threading.Lock()


def _write_atomically(path: str, text: str) -> None:
    """Concurrent conversations may fetch the same transcript; never expose a half-written file."""
    tmp_path = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp_path, path)


def _resolve_chat_transcript(req: ChatRequest, source_key: str) -> tuple[Optional[str], Optional[str]]:
    """Return (local transcript path, error response text)."""
    with _chat_transcripts_lock:
        cached = _chat_transcripts.get(source_key)
    if cached and os.path.exists(cached):
        return cached, None

    if req.video_url:
        video_id = None
        if "v=" in req.video_url:
            video_id = req.video_url.split("v=")[1].split("&")[0]

        transcript_path = None
        if video_id and supabase:
            try:
                result = supabase.table("video_analyses").select("transcript_filename").eq("video_identifier", video_id).execute()
                if result.data and len(result.data) > 0:
                    transcript_filename = result.data[0].get("transcript_filename")
                    if transcript_filename:
                        print(f"ðŸ“¥ Downloading transcript from Supabase: {transcript_filename}")
                        transcript_data = supabase.storage.from_("transcripts").download(transcript_filename)
                        transcript_text = transcript_data.decode("utf-8")

                        upload_dir = os.path.join(os.getcwd(), "uploads")
                        os.makedirs(upload_dir, exist_ok=True)
                        transcript_path = os.path.join(upload_dir, f"transcript_{video_id}.txt")
                        _write_atomically(transcript_path, transcript_text)
                        print(f"âœ… Transcript saved locally: {transcript_path}")
            except Exception as e:
                print(f"âš ï¸  Failed to load transcript from Supabase: {e}")

        if not transcript_path:
            print("ðŸ“¥ Fetching transcript from YouTube...")
            transcript = get_video_transcript(req.video_url)
            if "Error:" in transcript:
                return None, transcript
            transcript_path = save_transcript_in_uploads(req.video_url, transcript)
    elif req.id in STATIC_TRANSCRIPTS:
        transcript_path = STATIC_TRANSCRIPTS[req.id]
    else:
        return None, "âŒ Unknown dashboard ID or missing transcript."

    with _chat_transcripts_lock:
        _chat_transcripts[source_key] = transcript_path
    return transcript_path, None


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    conversation_id = normalize_conversation_id(req.conversation_id)
    source_key = _chat_source_key(req)
    if not source_key:
        return {"response": "âŒ No transcript loaded. Provide video_url or valid id.", "conversation_id": conversation_id}

    session = chat_sessions.get(conversation_id, source_key)
    with session.lock:
        if not session.transcript_path:
            transcript_path, error = _resolve_chat_transcript(req, source_key)
            if error:
                return {"response": error, "conversation_id": conversation_id}
            session.transcript_path = transcript_path

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

        def _invoke():
            # Retriever and LLM are resolved per attempt, so after an OpenAI quota error the retry
            # uses Gemini for both (with a Gemini-built index, never OpenAI vectors)
            retriever, _ = initialize_retrieval(session.transcript_path)
            return answer_question(req.message, retriever, session.history, prompt=chat_prompt)

        try:
            response = run_with_fallback(_invoke)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"AI service error: {e}")

        session.add_turn(req.message, response["answer"])
        recent_history = [{"question": q, "answer": a} for q, a in session.history]

    source_docs = response.get("source_documents", []) or []
    sources = []
    seen_chunks = set()
    for doc in source_docs:
        chunk_text = doc.page_content.strip()
        if chunk_text in seen_chunks:
            continue
        seen_chunks.add(chunk_text)
        sources.append({
            "chunk": doc.metadata.get("chunk", 0),
            "source": doc.metadata.get("source", "transcript"),
            "text": chunk_text,
        })
    sources.sort(key=lambda x: x["chunk"])

    suggestions = generate_follow_up_questions(
        user_question=req.message,
        bot_answer=response["answer"],
        chat_history=recent_history,
    )

    return {
        "response": response["answer"],
        "suggestions": suggestions,
        "sources": sources,
        "provider": get_active_provider(),
        "conversation_id": conversation_id,
    }


@app.get("/summary")
def generate_summary(id: str = Query("1")):
    """For preloaded dashboards: return static summary from codebase. No DB or OpenAI."""
    from static_summaries import STATIC_SUMMARIES

    if id not in STATIC_TRANSCRIPTS:
        return {"summary": "âŒ Unknown dashboard ID or missing transcript.", "provider": None}

    if id in STATIC_SUMMARIES and STATIC_SUMMARIES[id]:
        sections = build_summary_sections(STATIC_SUMMARIES[id], [])
        sections = apply_preloaded_anchors(sections, id)
        return {
            "summary": STATIC_SUMMARIES[id],
            "sections": sections,
            "provider": "static",
        }

    return {
        "summary": "âŒ Static summary not yet generated. Run from project root: python scripts/populate_preloaded_summaries.py",
        "provider": None,
    }


@app.post("/summary")
def generate_summary_from_youtube(data: dict = Body(...)):
    video_url = data.get("video_url")
    if not video_url:
        return {"summary": "âŒ No video URL provided."}

    video_id = extract_video_id(video_url)

    # Summaries are generated once per video and saved to video_analyses.summary
    analysis_row = None
    if video_id and supabase:
        try:
            result = supabase.table("video_analyses").select("transcript_filename,summary").eq("video_identifier", video_id).execute()
            analysis_row = result.data[0] if result.data else None
        except Exception as e:
            print(f"Failed to look up video analysis: {e}")
    saved = (analysis_row or {}).get("summary")
    if saved and saved.get("summary"):
        sections = saved.get("sections") or []
        # Bullets get timestamps from YouTube captions; if captions were unavailable when this was
        # saved, re-anchor them now (no LLM call). Prose sections never carry timestamps.
        if any(s.get("bullet") and s.get("timestamp") is None for s in sections):
            try:
                entries = get_video_transcript_entries(video_url)
            except Exception:
                entries = None
            if entries:
                sections = build_summary_sections(saved["summary"], entries)
                try:
                    supabase.table("video_analyses").update({
                        "summary": {**saved, "sections": sections},
                    }).eq("video_identifier", video_id).execute()
                except Exception as e:
                    print(f"Failed to update summary timestamps for {video_id}: {e}")
        return {
            "summary": saved["summary"],
            "sections": sections,
            "provider": saved.get("provider"),
            "cached": True,
        }

    transcript_entries = None
    try:
        transcript_entries = get_video_transcript_entries(video_url)
    except Exception:
        transcript_entries = None

    transcript_text = None
    if analysis_row:
        try:
            transcript_filename = analysis_row.get("transcript_filename")
            if transcript_filename:
                print(f"ðŸ“¥ Downloading transcript from Supabase: {transcript_filename}")
                transcript_data = supabase.storage.from_("transcripts").download(transcript_filename)
                transcript_text = transcript_data.decode("utf-8")
                print(f"âœ… Transcript loaded from Supabase ({len(transcript_text)} chars)")
        except Exception as e:
            print(f"âš ï¸  Failed to load transcript from Supabase: {e}")

    if not transcript_text:
        print("ðŸ“¥ Fetching transcript from YouTube...")
        if not transcript_entries:
            return {"summary": "Error: Failed to fetch transcript timestamps from YouTube."}

        transcript = "\n".join([entry["text"] for entry in transcript_entries])
        transcript_path = save_transcript_in_uploads(video_url, transcript)

        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                transcript_text = f.read()
        except Exception as e:
            return {"summary": f"âŒ Failed to read transcript: {str(e)}"}

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

    try:
        # Chain is built per attempt so a quota fallback picks up the next provider
        result = run_with_fallback(
            lambda: (post_summary_prompt | get_llm() | StrOutputParser()).invoke({"transcript": transcript_text}),
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service error: {e}")

    response = {
        "summary": result,
        "sections": build_summary_sections(result, transcript_entries or []),
        "provider": get_active_provider(),
    }
    # Only processed videos have a row to save into; YouTube-caption fallbacks regenerate each time
    if analysis_row:
        try:
            supabase.table("video_analyses").update({
                "summary": {**response, "generated_at": datetime.now().isoformat()},
            }).eq("video_identifier", video_id).execute()
        except Exception as e:
            print(f"Failed to save summary for {video_id}: {e}")
    return response


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

    def count_words(text):
        text_lower = text.lower()
        return {word: text_lower.count(word.lower()) for word in HIGH_SIGNAL_WORDS}

    word_counts = {
        "current": count_words(current_text),
        "previous": count_words(previous_text),
    }

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
        gpt_data = invoke_json([("human", prompt)], temperature=0.3)
    except Exception as e:
        return {"error": f"AI comparison failed: {str(e)}"}

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
    "1": "dC9yOuhiNrk",
    "2": "8K4aHLrekqQ",
    "3": "URIsVKPmhGg",
    "4": "fouFNKTDPmk",
    "5": "Gub5qCTutZo",
    "6": "AeznZIbgXhk",
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
        # Red flags are generated once per video and saved to video_analyses.red_flags
        # (docs/migrations/003). Until that column exists, fall back to generating every time.
        try:
            result = supabase.table("video_analyses").select("relevance_filename,red_flags").eq("video_identifier", video_id).execute()
            can_save = True
        except Exception as e:
            if "red_flags" not in str(e):
                raise
            result = supabase.table("video_analyses").select("relevance_filename").eq("video_identifier", video_id).execute()
            can_save = False
        if not result.data or len(result.data) == 0:
            return {"red_flags": [], "error": "Video analysis not found"}

        saved = result.data[0].get("red_flags")
        if saved and isinstance(saved.get("flags"), list):
            return {"red_flags": saved["flags"], "cached": True}

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

        numbered = "\n".join([f"[{s['sentence_index']}] {s['sentence_text']}" for s in sentences[:500]])

        model_name = get_model_name()
        out = invoke_json(
            [
                (
                    "system",
                    """You are a financial analyst. Analyze earnings call transcripts for RED FLAGS that could concern investors.
Return JSON: {"red_flags": [{"sentence_index": int, "quote": "exact quote", "category": string, "severity": "high"|"medium"|"low", "description": "brief explanation"}]}.
Categories: vague_evasive, guidance_change, margin_pressure, regulatory_legal, management_change, debt_leverage, other.
Only include genuine concerns. Be conservative - max 12 flags. Use sentence_index from the transcript. Return valid JSON only.""",
                ),
                ("human", f"Earnings call transcript (sentence_index, text):\n\n{numbered}"),
            ],
            temperature=0.2,
        )
        flags = out.get("red_flags", out.get("flags", []))
        if isinstance(flags, dict):
            flags = list(flags.values()) if isinstance(next(iter(flags.values()), None), dict) else []
        flags = flags[:15]

        if can_save:
            try:
                supabase.table("video_analyses").update({
                    "red_flags": {"flags": flags, "model": model_name, "generated_at": datetime.now().isoformat()},
                }).eq("video_identifier", video_id).execute()
            except Exception as e:
                print(f"Failed to save red flags for {video_id}: {e}")
        return {"red_flags": flags}
    except Exception as e:
        print(f"Red flags error: {e}")
        return {"red_flags": [], "error": str(e)}


_stock_chart_cache: dict = {}


@app.post("/generate-stock")
def generate_stock(payload: dict):
    ticker = payload.get("ticker")
    date = payload.get("date")

    # Same contract as the former Next.js /api/stock route: 400 for bad input, {"error"} bodies otherwise
    if not ticker or not date or not isinstance(ticker, str) or not isinstance(date, str):
        return JSONResponse({"error": "Missing ticker or date parameter"}, status_code=400)

    # Runs in-process (like /generate-indicators); a finished 48h window never changes, so cache it
    key = (ticker.upper(), date)
    if key in _stock_chart_cache:
        return _stock_chart_cache[key]

    from stockchartgenerationV2 import get_stock_chart
    result = get_stock_chart(ticker, date)
    if "error" not in result and datetime.strptime(result["end_date"], "%Y-%m-%d") <= datetime.now():
        _stock_chart_cache[key] = result
    return result


def _parses(value: str, fmt: str) -> bool:
    try:
        datetime.strptime(value, fmt)
        return True
    except ValueError:
        return False


@app.post("/generate-indicators")
def generate_indicators(payload: dict = Body(...)):
    """Generate economic indicators (VIX, TNX, DXY) data for the given time window."""
    start_local = payload.get("startLocal")
    hours = payload.get("hours", 48)
    interval = payload.get("interval", "5m")
    indicators = payload.get("indicators") or ["VIX", "TNX", "DXY"]

    # Same contract as the former Next.js /api/indicators route: 400 + {"ok": false} for bad input
    if not start_local or not isinstance(start_local, str):
        return JSONResponse({"ok": False, "error": "Missing startLocal parameter"}, status_code=400)
    if not isinstance(hours, (int, float)) or not 0 < hours <= 24 * 30:
        return JSONResponse({"ok": False, "error": "hours must be a number between 0 and 720"}, status_code=400)
    if not isinstance(interval, str) or not isinstance(indicators, list):
        return JSONResponse({"ok": False, "error": "Invalid interval or indicators"}, status_code=400)

    formatted_date = start_local
    try:
        if "/" in start_local:
            parts = start_local.strip().split(" ")
            date_part = parts[0]
            time_part = parts[1] if len(parts) > 1 else "09:30"
            m, d, y = date_part.split("/")
            full_year = f"20{y}" if int(y) < 50 else f"19{y}"
            formatted_date = f"{full_year}-{m.zfill(2)}-{d.zfill(2)} {time_part}"
        if not any(_parses(formatted_date, fmt) for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d")):
            raise ValueError(formatted_date)
    except ValueError:
        return JSONResponse(
            {"ok": False, "error": "Invalid request", "details": f"Unrecognized startLocal: {start_local}"},
            status_code=400,
        )

    from economicIndicatorsV2 import get_economic_indicators_json
    return get_economic_indicators_json(formatted_date, hours, interval, indicators)


_video_date_cache: dict = {}


def _yt_upload_date(video_id: str) -> Optional[str]:
    """YouTube upload date (YYYYMMDD) via yt-dlp; cached since it never changes."""
    if video_id in _video_date_cache:
        return _video_date_cache[video_id]
    try:
        result = subprocess.run(
            ["yt-dlp", "--no-update", "--skip-download", "--print", "upload_date",
             f"https://www.youtube.com/watch?v={video_id}"],
            capture_output=True, text=True, timeout=45,
        )
        date = result.stdout.strip().splitlines()[-1] if result.returncode == 0 and result.stdout.strip() else None
    except Exception as e:
        print(f"yt-dlp upload date failed for {video_id}: {e}")
        date = None
    if date:
        _video_date_cache[video_id] = date
    return date


def _to_chart_date(raw: Optional[str]) -> Optional[str]:
    """Normalize YYYYMMDD or ISO dates to the M/D/YY format the chart endpoints expect."""
    if not raw:
        return None
    raw = str(raw).strip()
    for fmt, length in (("%Y%m%d", 8), ("%Y-%m-%d", 10)):
        try:
            d = datetime.strptime(raw[:length], fmt)
            return f"{d.month}/{d.day}/{d.strftime('%y')}"
        except ValueError:
            continue
    return None


@app.get("/video-info")
def video_info(video_url: str = Query(...)):
    """Ticker and call date for a custom (non-preloaded) dashboard, used by the stock/indicator charts."""
    video_id = extract_video_id(video_url)
    row = {}
    if supabase:
        try:
            result = supabase.table("video_analyses").select("*").eq("video_identifier", video_id).execute()
            row = result.data[0] if result.data else {}
        except Exception as e:
            print(f"video-info lookup failed: {e}")
    metadata = row.get("metadata") or {}

    ticker = metadata.get("ticker")
    if not ticker:
        # Pipeline names files "<ticker>_<video_id>_<timestamp>_transcript.txt"
        prefix = (row.get("transcript_filename") or "").split("_")[0]
        ticker = prefix.upper() if prefix else None
    if ticker == "UNKNOWN":
        ticker = None

    date = _to_chart_date(metadata.get("upload_date")) or _to_chart_date(_yt_upload_date(video_id))
    return {"video_id": video_id, "ticker": ticker, "date": date, "title": metadata.get("title")}
