# api_chatbot.py
from fastapi import FastAPI, Query, Body
from pydantic import BaseModel
from transcript_retrieval import get_video_transcript, get_video_transcript_entries, save_transcript_as_txt
from langchain_testing import initialize_retrieval, get_chat_response, generate_follow_up_questions
from langchain.memory import ConversationBufferMemory
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
from datetime import datetime
from pathlib import Path
from langchain.chains import ConversationalRetrievalChain
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from typing import Optional
from collections import Counter
import subprocess
import json
import re
from dotenv import load_dotenv
from supabase import create_client

from fastapi.middleware.cors import CORSMiddleware

# Load environment variables and initialize Supabase
load_dotenv()
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

last_used_id = None

app = FastAPI()

try:
    from create_dashboard_endpoint import router as dashboard_router
    app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
except ImportError as e:
    print(f"Warning: Could not import dashboard creation endpoint: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True, output_key="answer")
retriever = None
qa_chain = None
summary_chain = None

STATIC_TRANSCRIPTS = {
    "1": "transcripts/apple_seeking_alpha.txt",
    "2": "transcripts/cvs_seeking_alpha.txt",
    "3": "transcripts/alphabet_seeking_alpha.txt",
    "4": "transcripts/shell_seeking_alpha.txt",
    "5": "transcripts/tesla_seeking_alpha.txt",
    "6": "transcripts/walmart_seeking_alpha.txt",
}

PRELOADED_VIDEOS_PATH = Path(__file__).resolve().parent.parent / "frontend" / "lib" / "preloaded_videos.json"
with open(PRELOADED_VIDEOS_PATH, "r", encoding="utf-8") as f:
    PRELOADED_VIDEOS = json.load(f)

PRELOADED_SUMMARY_ANCHORS_PATH = Path(__file__).resolve().parent / "preloaded_summary_anchors.json"
with open(PRELOADED_SUMMARY_ANCHORS_PATH, "r", encoding="utf-8") as f:
    PRELOADED_SUMMARY_ANCHORS = json.load(f)

UPLOADS_DIR = "uploads"
chat_history = []


class ChatRequest(BaseModel):
    message: str
    id: Optional[str] = None
    video_url: Optional[str] = None


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


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    global retriever, qa_chain, memory, last_used_id

    source_changed = False

    if req.video_url:
        if last_used_id != f"YT::{req.video_url}":
            source_changed = True
            last_used_id = f"YT::{req.video_url}"
    elif req.id:
        if last_used_id != req.id:
            source_changed = True
            last_used_id = req.id

    if source_changed:
        memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True, output_key="answer")
        retriever = None
        qa_chain = None

    if req.video_url and not retriever:
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
                        with open(transcript_path, "w", encoding="utf-8") as f:
                            f.write(transcript_text)
                        print(f"âœ… Transcript saved locally: {transcript_path}")
            except Exception as e:
                print(f"âš ï¸  Failed to load transcript from Supabase: {e}")

        if not transcript_path:
            print("ðŸ“¥ Fetching transcript from YouTube...")
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
            return {"response": "âŒ Unknown dashboard ID or missing transcript."}

    if not retriever:
        return {"response": "âŒ No transcript loaded. Provide video_url or valid id."}

    if qa_chain is None:
        prompt_template = ChatPromptTemplate.from_template(
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
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            retriever=retriever,
            memory=memory,
            combine_docs_chain_kwargs={"prompt": prompt_template},
            return_source_documents=True,
            output_key="answer"
        )

    response = qa_chain.invoke({"question": req.message})
    chat_history.append({"question": req.message, "answer": response["answer"]})

    source_docs = response.get("source_documents", [])
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
        chat_history=chat_history,
        retriever=retriever
    )

    return {"response": response["answer"], "suggestions": suggestions, "sources": sources}


@app.get("/summary")
def generate_summary(id: str = Query("1")):
    from static_summaries import STATIC_SUMMARIES

    if id not in STATIC_TRANSCRIPTS:
        return {"summary": "âŒ Unknown dashboard ID or missing transcript."}

    if id in STATIC_SUMMARIES and STATIC_SUMMARIES[id]:
        sections = build_summary_sections(STATIC_SUMMARIES[id], [])
        sections = apply_preloaded_anchors(sections, id)
        return {
            "summary": STATIC_SUMMARIES[id],
            "sections": sections,
            "provider": "static",
        }

    transcript_path = STATIC_TRANSCRIPTS[id]
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_text = f.read()
    except Exception as e:
        return {"summary": f"âŒ Failed to load transcript: {str(e)}"}

    global summary_chain
    if summary_chain is None:
        prompt = PromptTemplate(
            input_variables=["transcript"],
            template="""
You are a financial analyst assistant. Read the following earnings call transcript and generate a detailed yet concise summary highlighting the key financial results, executive commentary, and any forward-looking statements. Bold any key terms in the summary. Start the summary with a very brief (max one paragraph) overall summary of the call, then go into a mode detailed summary.

Transcript:
{transcript}

Summary:
"""
        )
        summary_chain = LLMChain(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            prompt=prompt
        )

    summary = summary_chain.run(transcript=transcript_text)
    return {"summary": summary}


@app.post("/summary")
def generate_summary_from_youtube(data: dict = Body(...)):
    video_url = data.get("video_url")
    if not video_url:
        return {"summary": "âŒ No video URL provided."}

    video_id = None
    if "v=" in video_url:
        video_id = video_url.split("v=")[1].split("&")[0]

    transcript_entries = None
    try:
        transcript_entries = get_video_transcript_entries(video_url)
    except Exception:
        transcript_entries = None

    transcript_text = None
    if video_id and supabase:
        try:
            result = supabase.table("video_analyses").select("transcript_filename").eq("video_identifier", video_id).execute()
            if result.data and len(result.data) > 0:
                transcript_filename = result.data[0].get("transcript_filename")
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

    global summary_chain
    if summary_chain is None:
        prompt = PromptTemplate(
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
        summary_chain = LLMChain(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            prompt=prompt
        )

    result = summary_chain.run(transcript=transcript_text)
    return {
        "summary": result,
        "sections": build_summary_sections(result, transcript_entries or []),
        "provider": "openai",
    }


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
    start_local = payload.get("startLocal")
    hours = payload.get("hours", 48)
    interval = payload.get("interval", "5m")
    indicators = payload.get("indicators", ["VIX", "TNX", "DXY"])

    if not start_local:
        return {"ok": False, "error": "startLocal required"}

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
