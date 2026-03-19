# SimpliEarn — Technical Interview Preparation Document

> Prepared for: Ashwin Vijayakumar (RAG Team)
> Role on Project: RAG Team Member (Conversational AI, Vector Search, LLM Orchestration)
> Demoed: April 15, 2025 at BDBI Demo Day

---

## TABLE OF CONTENTS

1. [The Elevator Pitch](#1-the-elevator-pitch)
2. [What Is SimpliEarn — High Level](#2-what-is-simplilearn--high-level)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Technology Stack — Deep Dive](#4-technology-stack--deep-dive)
5. [RAG System — Your Core Contribution](#5-rag-system--your-core-contribution)
6. [Sentiment Analysis Pipeline](#6-sentiment-analysis-pipeline)
7. [Data Flow — End to End](#7-data-flow--end-to-end)
8. [Database & Cloud Infrastructure](#8-database--cloud-infrastructure)
9. [QoQ Comparison Feature](#9-qoq-comparison-feature)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Challenges & How You Solved Them](#11-challenges--how-you-solved-them)
12. [What You Learned](#12-what-you-learned)
13. [Why These Technologies Were Chosen](#13-why-these-technologies-were-chosen)
14. [Recruiter Q&A — Likely Interview Questions & Model Answers](#14-recruiter-qa--likely-interview-questions--model-answers)

---

## 1. THE ELEVATOR PITCH

> **"SimpliEarn is a full-stack AI-powered platform that transforms raw earnings call videos from YouTube into interactive financial dashboards — complete with AI chat, sentiment analysis, stock charts, and quarter-over-quarter comparisons. A user pastes a YouTube link, and within 15 minutes they have a fully analyzed, queryable dashboard. We built this as a 19-person team for BDBI Demo Day."**

---

## 2. WHAT IS SIMPLILEARN — HIGH LEVEL

**The Problem:**
Earnings calls are crucial for investors but are dense, hour-long events full of financial jargon. Retail investors don't have the tools or time to extract meaningful signals from them.

**The Solution:**
SimpliEarn automates the entire pipeline:
- Downloads the audio from YouTube
- Transcribes it using AssemblyAI
- Runs NLP-based sentiment analysis (relevance + specificity)
- Builds a searchable vector database from the transcript
- Deploys a GPT-4o chatbot to answer questions about the call
- Generates a visual dashboard with stock price movement, economic indicators, and historical comparisons

**Who it's for:**
Retail investors and students who want actionable financial insights without being experts.

**Key differentiator:**
Most tools only give you a transcript or a one-paragraph summary. SimpliEarn gives you a fully interactive, AI-powered research environment from just a YouTube link.

---

## 3. SYSTEM ARCHITECTURE OVERVIEW

SimpliEarn is a **microservices architecture** with three tiers:

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND — Next.js 15 / React 19 (Port 3000)              │
│  Dashboard: Video + Stock Chart + Sentiment + QoQ + Chat   │
└────────────────────────────────────────────────────────────┘
                         ↕ REST API
┌──────────────────────────────┬─────────────────────────────┐
│  RAG API — FastAPI (8000)    │  Sentiment API — FastAPI    │
│  LangChain + FAISS + GPT-4o  │  (8001) HuggingFace + Torch │
│  Chat, Summary, QoQ, Jobs    │  Relevance, Specificity     │
└──────────────────────────────┴─────────────────────────────┘
                         ↕ Data Layer
┌─────────────────────────────────────────────────────────────┐
│  Supabase (PostgreSQL + Object Storage)                     │
│  video_analyses table | transcripts bucket | sentiment bucket│
└─────────────────────────────────────────────────────────────┘
                         ↕ External APIs
┌────────────────────────────────────────────────────────────┐
│  OpenAI GPT-4o │ AssemblyAI │ Alpha Vantage │ Yahoo Finance│
│  YouTube/yt-dlp │ FRED API                                 │
└────────────────────────────────────────────────────────────┘
```

**Two separate backend services** were a deliberate decision:
- The RAG API (port 8000) handles conversational AI, summaries, and orchestration
- The Sentiment API (port 8001) handles ML inference (transformers, heavy compute)
- Separating them lets each scale independently and avoids one service crashing the other

---

## 4. TECHNOLOGY STACK — DEEP DIVE

### Frontend
| Technology | Why It Was Chosen |
|---|---|
| **Next.js 15** (App Router) | SSR, file-based routing, API routes, production optimizations built-in |
| **React 19** | Component model, state management, ecosystem |
| **TypeScript** | Type safety across a 19-person team prevents a class of bugs entirely |
| **Tailwind CSS 4** | Rapid UI development without fighting CSS specificity |
| **Chart.js + react-chartjs-2** | Lightweight, declarative charting for line/bar/overlay charts |
| **Vercel Analytics** | Free built-in pageview tracking |

### Backend
| Technology | Why It Was Chosen |
|---|---|
| **FastAPI** | Modern Python async API framework; auto-generates OpenAPI/Swagger docs |
| **LangChain 0.3** | Abstraction layer for chaining LLM calls, retrieval, and memory |
| **OpenAI GPT-4o** | Best-in-class reasoning for financial language; context window supports long transcripts |
| **FAISS (CPU)** | Local, persistent vector similarity search; no external service needed, no added latency |
| **HuggingFace Transformers** | Zero-shot classification for sentiment — no labeled training data required |
| **PyTorch** | Backend for transformer inference |
| **AssemblyAI** | Higher accuracy than Whisper/Google for domain-specific financial speech; speaker diarization |
| **yt-dlp** | More reliable than pytube for audio extraction from YouTube |
| **yfinance** | Free, simple Yahoo Finance API wrapper for stock prices |
| **Supabase** | Free tier PostgreSQL + S3-compatible storage; Postgres RLS for security |

### Cloud / DevOps
| Technology | Why It Was Chosen |
|---|---|
| **Docker** | Reproducible builds across team; necessary for Cloud Run |
| **Google Cloud Build** | CI/CD pipeline integrated with GCP ecosystem |
| **Google Cloud Run** | Serverless containers; only pay when requests come in; scales to zero |
| **Google Secret Manager** | Secure API key storage injected at build/runtime |

---

## 5. RAG SYSTEM — YOUR CORE CONTRIBUTION

**RAG = Retrieval-Augmented Generation**

### Why RAG Instead of Just Feeding GPT the Transcript?

Earnings call transcripts are 40,000–80,000 characters. GPT-4o's context window can handle that, but:
- Cost: Sending 80K tokens on every single user message is expensive
- Relevance: The LLM gets better, more focused answers from targeted chunks
- Latency: Smaller context = faster responses
- Scalability: RAG scales to any transcript length, even if GPT limits shrink

RAG solves this by pre-indexing the transcript so the LLM only sees the 3–5 most relevant chunks per question.

### How the RAG Pipeline Works (Step by Step)

```
1. USER SENDS A MESSAGE
   e.g., "What did the CEO say about iPhone revenue?"

2. SOURCE DETECTION
   Is this a new video/ID? → Clear vector store and conversation memory
   (Prevents cross-contamination between different earnings calls)

3. TRANSCRIPT LOADING
   If YouTube URL → check Supabase first → download from Supabase storage
   If preset ID → load from local static file mapping

4. VECTOR STORE CREATION (FAISS)
   RecursiveCharacterTextSplitter(chunk_size=500, overlap=100)
   - Split transcript into ~500-char chunks with 100-char overlap
   - Overlap ensures sentences aren't cut mid-meaning at chunk boundaries
   - Generate SHA-256 hash of transcript content
   - If index already on disk → load (cache hit)
   - If new → embed each chunk with OpenAI text-embedding-ada-002 → save to disk

5. RETRIEVAL
   - Embed the user's question with the same model
   - Query FAISS index with cosine similarity
   - Retrieve top-K most relevant chunks

6. GENERATION
   ConversationalRetrievalChain:
   - System prompt: "You are a financial assistant... assume user is not an expert..."
   - Inject retrieved chunks as context
   - Inject conversation history (memory buffer)
   - GPT-4o generates a grounded, accurate answer

7. FOLLOW-UP SUGGESTIONS
   - Separate GPT call: "Given this Q&A, generate 2-3 follow-up questions"
   - Returns as suggestion chips to the user

8. RESPONSE
   { response: "...", suggestions: ["Q1", "Q2", "Q3"] }
```

### Key Design Decisions in the RAG System

**Content-based caching:**
The FAISS index is cached using a SHA-256 hash of the transcript. This means:
- Same transcript never gets re-embedded (saves OpenAI API costs)
- Different transcripts get their own isolated index
- Works correctly even if the same URL is loaded twice

**Conversation memory:**
`ConversationBufferMemory` stores the full chat history. The chain condenses the history + the new question before hitting the retriever, so follow-up questions like "Tell me more about that" work correctly.

**Source switching:**
When a user changes which earnings call they're looking at, the code detects the change and clears both the retriever and the memory. This prevents the LLM from hallucinating answers from the previous call.

**Chunk Strategy:**
`RecursiveCharacterTextSplitter` with chunk_size=500 and overlap=100 was chosen because:
- 500 chars ≈ 3-5 sentences — semantic enough to be a meaningful answer unit
- 100-char overlap — handles boundary cases where a key point spans two chunks
- Recursive splitting tries paragraph → sentence → word boundaries in that order

---

## 6. SENTIMENT ANALYSIS PIPELINE

Two independent metrics are computed for every sentence in the transcript:

### Metric 1: Relevance (How financially meaningful is this sentence?)
- Uses a HuggingFace zero-shot classifier
- Label: "financially relevant" vs background noise
- Scores sentences 0–1 (also mapped to -1 to +1 scale)
- Output: CSV with sentence-level scores
- Chart color: Green line
- Example: "Revenue grew 12% year-over-year" → high relevance | "Thank you for joining us today" → low relevance

### Metric 2: Specificity (Is the language concrete or vague?)
- Same zero-shot approach
- Label: "specific/concrete" vs "vague/hedged"
- Purpose: Distinguish "We expect 10% growth" from "We see potential opportunities"
- Chart color: Purple line
- High specificity = actionable, confident language
- Low specificity = PR spin, hedging, deflection

### Why Zero-Shot Classification?
- No labeled training data needed (no one has labeled 10,000 earnings call sentences)
- Pre-trained NLI (Natural Language Inference) models generalize well
- Models like facebook/bart-large-mnli were trained on entailment tasks; zero-shot is a natural repurposing

### Technical Pipeline
```
Transcript text
    ↓
Sentence tokenization
    ↓
Batch inference (batch_size=32)
    ↓
Per-sentence scores
    ↓
Moving average (window=20) applied
    ↓
CSV written: [sentence_index, sentence_text, score_0_1, score_-1_1, ma_score]
    ↓
Uploaded to Supabase sentiment bucket
    ↓
Database entry updated with filename
    ↓
Frontend downloads CSV → Chart.js renders line chart
```

---

## 7. DATA FLOW — END TO END

### Full Pipeline: YouTube Link → Interactive Dashboard (~15 minutes)

```
USER PASTES URL + OPTIONAL TICKER (Home Page)
    ↓
POST /dashboard/create-dashboard { youtube_url, ticker }
Returns: { job_id: "uuid-..." }
    ↓
[BACKGROUND JOB STARTS]

Step 1 — Download Audio (1-2 min)
  yt-dlp downloads best audio stream → temp .m4a file
  Fallback: pytube (less reliable, kept for redundancy)

Step 2 — Transcribe (5-15 min depending on duration)
  AssemblyAI API:
  - Speaker diarization (who said what)
  - High accuracy on financial jargon
  - Returns: full text + timestamps + per-speaker utterances

Step 3 — Extract Metadata
  Title → regex + company-name mapping → ticker guess
  Store: title, ticker, upload_date, description

Step 4 — Upload Transcript (< 1 min)
  Supabase transcripts bucket: {video_id}_transcript.txt

Step 5 — Sentiment Analysis (5-10 min)
  Run relevance script → {video_id}_relevance.csv → upload
  Run specificity script → {video_id}_specificity.csv → upload

Step 6 — Create Database Record
  video_analyses table: {
    video_identifier, transcript_filename,
    relevance_filename, specificity_filename, metadata
  }
    ↓
Frontend polls /dashboard/job-status/{job_id} every 3 seconds
When status = "completed" → redirect to /dashboard?video_url=...
    ↓
DASHBOARD RENDERS
  Video embed + Stock chart + Sentiment charts + QoQ + Chat
```

---

## 8. DATABASE & CLOUD INFRASTRUCTURE

### Supabase

**PostgreSQL Table: `video_analyses`**
```sql
id                  uuid PRIMARY KEY
video_identifier    text UNIQUE     -- YouTube video ID (e.g., "dQw4w9WgXcQ")
transcript_filename text            -- "dQw4w9WgXcQ_transcript.txt"
relevance_filename  text            -- "dQw4w9WgXcQ_relevance.csv"
specificity_filename text           -- "dQw4w9WgXcQ_specificity.csv"
metadata            jsonb           -- { title, ticker, upload_date, description }
created_at          timestamp
updated_at          timestamp
```

**Why JSONB for metadata?**
Different earnings calls have different metadata fields. JSONB gives flexibility without schema migrations — we can add `quarter`, `analyst_count`, or any new field without touching the table.

**Object Storage Buckets:**
- `transcripts/` — Raw .txt transcript files
- `sentiment/` — Analysis result CSVs

### Google Cloud Deployment

**Flow:**
Code push → Cloud Build triggers → Docker images built → Pushed to Container Registry → Deployed to Cloud Run

**Cloud Run advantages:**
- Serverless: scales to 0 when no traffic (saves cost for a student project)
- Containerized: same Docker image runs locally and in production
- Auto-scaling: handles traffic spikes without manual provisioning

**Secret Manager:**
API keys are never in the repo or Docker image. They're injected as environment variables at runtime from Google Secret Manager.

---

## 9. QoQ COMPARISON FEATURE

**Purpose:** Compare the same company's current earnings call to a previous quarter to detect narrative shifts.

**Three Components:**

1. **Sentiment Delta**
   - GPT-4o rates each transcript 1–10 for confidence/positivity
   - Delta = current_score - previous_score
   - Limitation: Executives are trained to always sound positive; scores cluster 7–9
   - This is a known Week 1 limitation; Week 2 plan replaces it with real per-speaker data

2. **Vocabulary Heatmap (Most Reliable)**
   - Counts occurrences of 10 "high-signal" words: AI, headwinds, margins, recession, growth, guidance, uncertainty, challenges, record, supply chain
   - Grouped bar chart shows current vs. previous quarter counts
   - Real signal: "AI" appeared 67x in Q1 FY2025 vs. 87x in Q2 FY2024 → topic emphasis shifted
   - Simple string scan but surprisingly informative

3. **Narrative Shifts**
   - GPT-4o analyzes first 6,000 chars of each transcript
   - Returns 3 strategic pivots or contradictions between quarters
   - Quality is high for Apple (sufficient context); cross-company comparisons are less useful

**Data Source:**
Alpha Vantage EARNINGS_CALL_TRANSCRIPT API — fetches historical quarters (free tier: 25 req/day). Apple has 5 quarters stored; other companies have only the current quarter.

---

## 10. FRONTEND ARCHITECTURE

### Page Structure (Next.js App Router)
```
app/
├─ (landing-pages)/page.tsx     # Home: URL input + library
├─ (landing-pages)/about/       # Team profiles
├─ (landing-pages)/faq/         # FAQ
├─ dashboard/page.tsx           # Main dashboard
└─ api/
   ├─ stock/route.ts            # Proxies to yfinance Python subprocess
   └─ indicators/route.ts       # Proxies to FRED API Python subprocess
```

### Dashboard Layout
- Left 62%: Video player + tab-based charts (Stock | Sentiment | Compare)
- Right 38%: AI-generated summary + chat interface
- Chat can expand to fullscreen overlay

### Key Components
| Component | What It Does |
|---|---|
| `ChartsFrame.tsx` | Tab container managing Stock/Sentiment/Compare views |
| `StockChart.tsx` | 48-hour price chart (48hrs around earnings call date) |
| `SentimentGraph.tsx` | Dual line chart for relevance + specificity scores |
| `QoQComparison.tsx` | Bar chart + delta widget + 3 narrative cards |
| `ChatBot.tsx` | Manages message history and API calls |
| `SuggestionChips.tsx` | Clickable follow-up question buttons below chat |
| `VideoFrame.tsx` | YouTube embed with timestamp linking |
| `SummaryFrame.tsx` | Collapsible AI-generated summary |

### Why API Routes Spawn Python Subprocesses
The `api/stock/route.ts` and `api/indicators/route.ts` Next.js routes spawn Python subprocesses to run `yfinance` and FRED API calls. This is a pragmatic hybrid:
- Next.js handles the HTTP routing and CORS
- Python handles the data fetching (existing team expertise + better finance libraries)
- In production this could be replaced with the FastAPI backend, but it works for the prototype

---

## 11. CHALLENGES & HOW YOU SOLVED THEM

### Challenge 1: YouTube Audio Downloads Are Unreliable
**Problem:** `pytube` frequently breaks when YouTube changes its internal API. Downloads would silently fail or return corrupted files.

**Solution:** Switched to `yt-dlp` as the primary downloader (actively maintained, handles YouTube changes), kept `pytube` as a fallback. Also added format detection to handle `.m4a`, `.mp4`, and `.webm` outputs.

---

### Challenge 2: FAISS Index Rebuilding on Every Restart
**Problem:** Rebuilding vector embeddings for a 60,000-character transcript takes ~30 seconds and costs money (OpenAI API calls for embeddings). Doing this every time the server restarts was unacceptable.

**Solution:** Content-based caching. Compute SHA-256 hash of the transcript text. If `faiss_indices/{hash}` exists on disk → load it. If not → build and save. Same transcript always hits the cache. Zero redundant API calls.

---

### Challenge 3: Chat Memory Mixing Up Different Earnings Calls
**Problem:** If a user chatted about Apple Q1, then navigated to Tesla Q3, the conversation memory still contained Apple context. The chatbot would give confused, wrong answers.

**Solution:** Source change detection. Every chat request includes `id` or `video_url`. Compare to the globally tracked `current_source`. If changed → clear the FAISS retriever AND the conversation memory buffer. Fresh start for each new source.

---

### Challenge 4: Sentiment Models Are Slow on CPU
**Problem:** Running HuggingFace transformer inference sentence-by-sentence on a 1,000-sentence transcript could take 30+ minutes on CPU.

**Solution:**
- Batch inference: group sentences into batches of 32 (configurable `batch_size`)
- GPU detection: code automatically uses CUDA if available (Google Cloud can provide GPU instances)
- Separated sentiment into its own FastAPI service so heavy ML inference doesn't block the RAG API

---

### Challenge 5: QoQ Sentiment Delta Is Noisy
**Problem:** Asked GPT to score executive tone 1–10. All scores came back 7–9. Earnings calls are structured to always sound confident; GPT learned this pattern and the delta was meaningless.

**Solution (known limitation):** Documented it honestly. Week 2 plan replaces the GPT score with:
- Per-speaker sentiment from Alpha Vantage's computed metrics
- CEO vs CFO gap (difference in their average tone)
- Prepared remarks vs Q&A drop (script vs unscripted tone shift)
- Analyst reception score

This is a good example of knowing when to ship and iterate rather than blocking the feature.

---

### Challenge 6: Coordinating 19 People Across 6 Teams
**Problem:** 19 people working on the same repository creates merge conflicts, misaligned APIs, and duplicated work.

**Solution:**
- Clear team separation: RAG team owns `RAG/`, Sentiment owns `sentiment/`, Full Stack owns `frontend/`
- Documented API contracts (INTEGRATION_GUIDE.md)
- Standardized environment variable patterns
- Each team runs their service independently on different ports

---

### Challenge 7: Transcription Accuracy for Financial Jargon
**Problem:** Financial speech contains names, tickers, and technical terms. Generic STT models (like the free YouTube auto-captions) often mangle these: "EPS" becomes "eps", ticker symbols are wrong, etc.

**Solution:** Used AssemblyAI, which has better financial domain accuracy than Whisper (for speaker diarization) and the free YouTube captions. The `transcript_retrieval.py` provides a fallback to YouTube's own transcripts, but AssemblyAI is the primary.

---

## 12. WHAT YOU LEARNED

### Technical Learnings

**RAG Architecture:**
- How vector databases work at a fundamental level (embeddings, cosine similarity, FAISS internals)
- Why chunk size and overlap matter for retrieval quality
- How LangChain orchestrates retrieval + memory + LLM into a chain
- Content-based caching as a practical engineering pattern

**LLM Engineering:**
- Prompt engineering for financial domain — framing the assistant as non-expert-friendly changes output tone significantly
- How to generate structured follow-up questions from unstructured conversation
- Token cost management: only send relevant chunks, not the full transcript

**API Design:**
- Background job pattern: long-running tasks need a job_id, status polling, and proper error states
- FastAPI async patterns for background tasks
- How to design two services that share a database (Supabase) without coupling

**DevOps:**
- Docker containerization for Python + Node.js environments
- Google Cloud Build CI/CD pipelines
- Secret Manager vs. environment variables: the right security model for cloud deployments
- Cloud Run's serverless container model

### Soft Skills / Process Learnings

- How to scope a feature honestly ("this is Week 1, here's the known limitation, here's Week 2's fix")
- How to document for a large team (API contracts matter more than code comments)
- How to make pragmatic tradeoffs (alpha vantage free tier is sufficient; don't over-engineer for users you don't have yet)
- How to demo well: the dashboard creation pipeline takes 15 minutes, so preloaded calls were prepared for demo day to avoid live waiting

---

## 13. WHY THESE TECHNOLOGIES WERE CHOSEN

### OpenAI GPT-4o vs. Alternatives
- GPT-4 Turbo, Claude, Gemini were considered
- GPT-4o chosen: best benchmark performance on financial reasoning + LangChain has first-class OpenAI support + team familiarity
- Context window (128k tokens) can actually handle the full transcript if needed

### FAISS vs. Pinecone / Weaviate / ChromaDB
- FAISS: local, free, no network latency, persistent with save/load — perfect for a school project
- Pinecone: managed, scalable — better in production but costs money
- ChromaDB: good Python integration but adds external dependency
- Decision: FAISS for prototyping, migrate to managed service if this goes to production

### AssemblyAI vs. OpenAI Whisper vs. Google STT
- Whisper: excellent accuracy, but runs locally (expensive GPU needed for real-time) or via API (limited speaker diarization)
- Google STT: good but speaker diarization requires more setup
- AssemblyAI: purpose-built for meeting/interview transcription with speaker diarization out of the box; best accuracy for the use case

### Supabase vs. Firebase vs. AWS S3 + RDS
- Supabase: PostgreSQL (vs. Firebase's NoSQL), S3-compatible storage, free tier is generous, RLS policies, REST API auto-generated
- Firebase: NoSQL is harder to query for our structured data
- AWS: more powerful but more setup overhead; Supabase covers the 80% case
- Key win: Supabase gives both a database AND file storage in one service

### Next.js vs. Vite + React / Vue / Svelte
- Next.js: SSR for SEO, built-in API routes (used for stock/indicators endpoints), App Router for clean organization
- Team had Next.js familiarity
- API routes let us avoid a separate Express.js server for lightweight endpoints

### FastAPI vs. Flask vs. Django
- FastAPI: async by design (important for background jobs), Pydantic validation, auto-generated Swagger docs
- Flask: synchronous, less structured
- Django: too heavyweight for an API microservice
- FastAPI's background tasks feature is exactly what dashboard creation needed

---

## 14. RECRUITER Q&A — LIKELY INTERVIEW QUESTIONS & MODEL ANSWERS

---

**Q: Tell me about SimpliEarn.**

A: SimpliEarn is an AI-powered financial analysis platform that converts earnings call videos into interactive dashboards. A user pastes a YouTube link, and the system downloads the audio, transcribes it with AssemblyAI, runs NLP sentiment analysis, builds a searchable vector database, and deploys a GPT-4o chatbot — all automatically. I was on the RAG team, specifically building the conversational AI system that lets users ask natural language questions about the earnings call and get grounded, accurate answers.

---

**Q: What is RAG and why did you use it instead of just sending the transcript to GPT?**

A: RAG stands for Retrieval-Augmented Generation. Instead of sending the entire transcript (40,000–80,000 characters) to the LLM on every message, you pre-index it into a vector database. When a user asks a question, you convert their question into an embedding, find the most semantically similar chunks from the transcript, and only send those chunks to the LLM as context.

Three reasons we used it:
1. **Cost**: Sending 80K tokens on every user message would be extremely expensive at scale
2. **Quality**: The LLM gets more focused, relevant context rather than having to sift through an entire hour-long conversation
3. **Scalability**: RAG works for any transcript length, even ones that exceed the context window

---

**Q: Explain how FAISS works.**

A: FAISS (Facebook AI Similarity Search) is a library for efficient similarity search over dense vector embeddings. When you embed text with a model like OpenAI's text-embedding-ada-002, each sentence or chunk becomes a high-dimensional vector (1536 dimensions). FAISS organizes these vectors in an index that allows fast nearest-neighbor lookups.

The basic operation is: given a query vector (the user's embedded question), find the K vectors in the index that have the highest cosine similarity. Cosine similarity measures the angle between two vectors — vectors pointing in similar directions (similar meaning) have a small angle and high cosine similarity.

For our scale (~1,000 chunks per transcript), a flat L2 index is fine. For millions of vectors, FAISS has hierarchical quantization techniques (IVF, PQ) that trade a bit of accuracy for massive speed improvements.

---

**Q: How do you handle conversation history in the RAG chatbot?**

A: We use LangChain's `ConversationBufferMemory` paired with `ConversationalRetrievalChain`. The chain has two steps:

1. **Condense**: Takes the conversation history + the new question and asks GPT to rephrase the question as a standalone query (so "Tell me more about that" becomes "Tell me more about Apple's iPhone revenue from the earnings call")
2. **Retrieve and generate**: Uses the condensed question to query FAISS, retrieves relevant chunks, and generates a response with the chunks + history as context

The memory buffer accumulates all messages in the current session. When the user switches to a different earnings call, we clear the memory entirely to prevent cross-contamination.

---

**Q: What's a vector embedding? How does semantic search work?**

A: A vector embedding is a numerical representation of text in a high-dimensional space, where semantically similar texts are mathematically close to each other. You pass text through a neural network (like OpenAI's text-embedding-ada-002), and it outputs a list of ~1536 floating point numbers.

The key property: "iPhone revenue was down 3%" and "Apple's phone sales declined" will have very similar embeddings, even though they share no exact words. This is semantic search — finding documents by meaning rather than keyword matching.

When a user asks "what did they say about phone sales?", we embed that question into the same vector space and find the transcript chunks with the smallest angular distance. Those are the most semantically relevant chunks to return.

---

**Q: Why did you use chunk_size=500 and overlap=100? How did you arrive at those numbers?**

A: These were empirically chosen after testing. At 500 characters:
- You get roughly 3–5 full sentences per chunk — enough context for the LLM to understand the meaning
- Not so large that the chunk becomes about multiple different topics
- Not so small that a single key sentence gets split in a way that loses its meaning

The 100-character overlap is a common practice to handle boundary cases. Without overlap, a key statement that spans two chunks would have its first half in chunk N and second half in chunk N+1. Neither chunk alone would retrieve it reliably. With overlap, at least one chunk contains the complete thought.

These are good defaults for a transcript with relatively uniform density. For code or tables, you'd use different strategies.

---

**Q: Walk me through the sentiment analysis approach. Why zero-shot classification?**

A: We measure two dimensions per sentence: relevance (how financially meaningful is this?) and specificity (is the language concrete or vague?).

Zero-shot classification works by repurposing a Natural Language Inference (NLI) model. These models are trained to predict whether a hypothesis follows from a premise. For zero-shot, we treat the sentence as the "premise" and our label (e.g., "financially relevant") as the "hypothesis." The model's confidence that the hypothesis follows from the premise becomes our score.

Why zero-shot specifically? We had no labeled training data. You'd need thousands of manually labeled earnings call sentences to train a supervised model. Zero-shot lets us get good results on day one without any labeled data. The NLI models (like BART-large-MNLI, trained on 400k premise-hypothesis pairs) generalize well enough to financial language.

---

**Q: Why use two separate backend services (ports 8000 and 8001)?**

A: Separation of concerns and isolation. The sentiment service runs HuggingFace transformer models — these are heavy, CPU/GPU-intensive processes. The RAG API handles user-facing chat, which needs to be low-latency.

If they were in the same process, a slow sentiment analysis job could block chat responses. Separate services also let them:
- Scale independently (sentiment needs more compute; RAG needs more memory)
- Fail independently (a crashed transformer model doesn't take down the chatbot)
- Be updated independently (different deployment cycles)
- Run on different hardware (sentiment could run on a GPU instance)

---

**Q: What's the data model in Supabase and why did you use JSONB for metadata?**

A: The core table is `video_analyses` with columns for the video identifier (YouTube video ID), filenames for the three stored files (transcript, relevance CSV, specificity CSV), and a JSONB metadata column.

JSONB (binary JSON) was chosen for metadata because different earnings calls might have different fields. Right now we store `title`, `ticker`, `upload_date`, and `description`. In the future, we might add `quarter`, `fiscal_year`, `analyst_count`, or `duration`. With JSONB, we can add these fields without schema migrations. PostgreSQL's JSONB also supports indexing and querying within the JSON, so it's not sacrificing queryability.

---

**Q: How does the Google Cloud Build / Cloud Run deployment work?**

A: The CI/CD pipeline defined in `cloudbuild.yaml` has these steps:
1. Install npm dependencies and build the Next.js app
2. Install Python dependencies
3. Build Docker images for both frontend and backend
4. Push images to Google Container Registry
5. Deploy backend image to Cloud Run (port 8000)
6. Deploy frontend image to Cloud Run (port 3000)

Cloud Run is Google's serverless container platform. You give it a Docker image, and it:
- Automatically starts instances on incoming requests
- Scales down to zero when there's no traffic (important for cost)
- Auto-scales up during demand spikes
- Manages HTTPS and load balancing

API keys are stored in Google Secret Manager and injected as environment variables at deployment time — they're never in the Docker image or codebase.

---

**Q: What would you do differently if you started over?**

A: A few things:

1. **Centralize the APIs earlier.** Having Next.js API routes spawn Python subprocesses for stock/indicators was a quick hack. A cleaner design would route everything through FastAPI and have Next.js only hit one backend.

2. **Use a managed vector database.** FAISS with local disk caching works for development, but in cloud deployment, container restarts lose the disk cache. Pinecone or Supabase's pgvector extension would give persistent, cloud-native vector storage.

3. **Real sentiment metrics from day one.** The QoQ sentiment delta using GPT scores 1–10 was not useful. I'd have pushed harder to use the Alpha Vantage per-speaker sentiment data from the start.

4. **More structured logging.** With 19 people debugging issues across 3 services, structured logs (JSON format) shipped to a centralized log aggregator would have saved a lot of time.

---

**Q: What's your takeaway from building this as part of a 19-person team?**

A: The biggest lesson was that API contracts matter more than implementation details. When you're on the RAG team and the frontend team needs to call your endpoints, having a written spec (the INTEGRATION_GUIDE.md) matters far more than how clean your internal code is. We also learned to draw clear ownership lines — the RAG team owns everything in `RAG/`, so there's never a question about who's responsible for a bug in that directory.

I also learned to scope honestly. The QoQ sentiment delta metric had known limitations in Week 1. The right call was to ship it, document the limitation, and have a concrete Week 2 plan — not to block the entire feature waiting for a perfect implementation.

---

**Q: What does this project demonstrate about your capabilities?**

A: It shows I can work at multiple levels of the stack:
- **LLM engineering**: RAG architecture, prompt engineering, context management, vector stores
- **API design**: FastAPI async endpoints, background jobs, job status polling
- **Systems thinking**: how to design two services that share a database without coupling, content-based caching, source change detection
- **Financial domain**: understanding what makes an earnings call insight valuable vs. noise
- **Large team collaboration**: 19 people, 6 teams, shared codebase — learned to communicate through documentation and clear API contracts

---

## QUICK REFERENCE — KEY NUMBERS TO KNOW

| Metric | Value |
|---|---|
| Team size | 19 people across 6 teams |
| Demo date | April 15, 2025 (BDBI Demo Day) |
| Frontend port | 3000 |
| RAG API port | 8000 |
| Sentiment API port | 8001 |
| Pipeline duration | ~15 minutes for typical 1-hour earnings call |
| Chunk size | 500 chars |
| Chunk overlap | 100 chars |
| Embedding model | text-embedding-ada-002 |
| LLM | GPT-4o |
| Sentiment batch size | 32 sentences |
| Moving average window | 20 sentences |
| Alpha Vantage rate limit | 25 requests/day (free) |
| Preset companies | Apple, CVS, Alphabet, Shell, Tesla, Walmart |
| Apple historical quarters | 5 (Q4 FY2023 through Q1 FY2025) |
| High-signal words tracked | 10 (AI, headwinds, margins, recession, growth, guidance, uncertainty, challenges, record, supply chain) |

---

*This document is for Ashwin Vijayakumar's personal interview preparation for the SimpliEarn project.*
