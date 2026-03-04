# Local Setup Guide

This guide gets SimpliEarn running completely locally (frontend, RAG API, sentiment API, YouTube transcript pipeline).

## Prerequisites

- **Python 3.9+** (3.11+ recommended)
- **Node.js 18+** and npm
- **yt-dlp** (for YouTube audio download): `brew install yt-dlp` on macOS

## 1. Environment Variables

### RAG (`RAG/.env`)

Copy from `RAG/.env.example` if needed. Required keys:

```
OPENAI_API_KEY=sk-your-key          # From https://platform.openai.com/api-keys
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key  # Needed for chatbot + library integration
```

### Sentiment (`sentiment/.env`)

Copy from `sentiment/.env.example` if needed. Required keys:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
ASSEMBLYAI_KEY=your-assemblyai-key  # For YouTube transcription (https://assemblyai.com)
```

Get Supabase credentials: Project → Settings → API. Use the **service_role** key (not anon).

### Frontend (`frontend/.env.local`)

Copy from `frontend/.env.example` if needed. For **user auth**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key   # Use anon key (not service_role) for frontend
```

For auth + settings setup details, see:
- [docs/AUTH_IMPLEMENTATION_STEPS.md](docs/AUTH_IMPLEMENTATION_STEPS.md)
- [docs/SUPABASE_SETTINGS_SETUP.md](docs/SUPABASE_SETTINGS_SETUP.md)

## 2. Python Dependencies (one-time)

From the project root:

```bash
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r RAG/requirements.txt
pip install -r sentiment/requirements.txt
```

## 3. Frontend Dependencies (one-time)

```bash
cd frontend
npm install
cd ..
```

## 4. Run All Services

Open **3 terminals** in the project root, activate the venv in each, then:

**Terminal 1 – RAG API (port 8000):**
```bash
source venv/bin/activate
cd RAG
uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 – Sentiment API (port 8001):**
```bash
source venv/bin/activate
cd sentiment
uvicorn api:app --reload --host 0.0.0.0 --port 8001
```

**Terminal 3 – Frontend (port 3000):**
```bash
cd frontend
npm run dev
```

Then open **http://localhost:3000** in your browser.

## 5. YouTube Pipeline

To create a dashboard from a YouTube earnings call:

1. Paste a YouTube URL on the homepage.
2. Optional: add a ticker symbol (e.g. AAPL).
3. Submit. The backend downloads audio, transcribes with AssemblyAI, runs sentiment analysis, and stores results in Supabase.

First run will download ML models (~500MB) for sentiment analysis.

## Troubleshooting

- **"Supabase not configured"** – Add `SUPABASE_URL` and `SUPABASE_KEY` to both `RAG/.env` and `sentiment/.env`.
- **"yt-dlp not found"** – Install with `brew install yt-dlp` (macOS) or `pip install yt-dlp`.
- **Transcription fails** – Check `ASSEMBLYAI_KEY` in `sentiment/.env` and your AssemblyAI credits.
- **Chatbot errors** – Ensure `OPENAI_API_KEY` is set in `RAG/.env`.
