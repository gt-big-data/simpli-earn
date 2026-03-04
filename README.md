# SimpliEarn

SimpliEarn is a full-stack app for earnings-call analysis:
- **Frontend:** Next.js app (`frontend`) with Supabase auth
- **RAG API:** FastAPI service (`RAG`) for transcript chat + summaries
- **Sentiment API:** FastAPI service (`sentiment`) for YouTube transcription/sentiment pipeline

## Prerequisites

- Python 3.9+ (3.11 recommended)
- Node.js 18+ and npm
- `yt-dlp` installed (`brew install yt-dlp` on macOS)

## Environment Setup

Create these env files before running locally:

- `RAG/.env`
  - `OPENAI_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (service role)
- `sentiment/.env`
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (service role)
  - `ASSEMBLYAI_KEY`
- `frontend/.env.local`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (required for delete-account API route)

Use the `.env.example` files where available.

## Install Dependencies

From project root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r RAG/requirements.txt
pip install -r sentiment/requirements.txt
```

Then install frontend packages:

```bash
cd frontend
npm install
cd ..
```

## Run the App

Start each service in a separate terminal.

1) **RAG API** (port 8000)
```bash
source venv/bin/activate
cd RAG
uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000
```

2) **Sentiment API** (port 8001)
```bash
source venv/bin/activate
cd sentiment
uvicorn api:app --reload --host 0.0.0.0 --port 8001
```

3) **Frontend** (port 3000)
```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Auth and Supabase SQL Setup

Run these SQL/setup docs in Supabase before testing auth/settings:

- `docs/supabase_profiles_migration.sql`
- `docs/supabase_avatars_storage.sql`
- `docs/AUTH_IMPLEMENTATION_STEPS.md`
- `docs/SUPABASE_SETTINGS_SETUP.md`

## Additional Docs

- Full local setup guide: `LOCAL_SETUP.md`
- Integration notes: `INTEGRATION_GUIDE.md`
