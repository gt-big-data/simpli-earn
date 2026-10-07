# SimpliEarn

SimpliEarn is a full-stack app for earnings-call analysis:
- **Frontend:** Next.js app (`frontend`) with Supabase auth
- **RAG API:** FastAPI service (`RAG`) for transcript chat + summaries
- **Sentiment API:** FastAPI service (`sentiment`) for YouTube transcription/sentiment pipeline

## Prerequisites

- Python 3.11 (the version the Docker images use)
- Node.js 20.9+ and npm (required by Next.js 16)
- `yt-dlp` installed (`brew install yt-dlp` on macOS)

## Environment Setup

Copy each example and fill in the values; every example marks its keys as **REQUIRED** or optional
and shows the defaults. Never commit the filled-in files.

| File | Copy from | Required |
| --- | --- | --- |
| `RAG/.env` | `RAG/.env.example` | `OPENAI_API_KEY` **or** `GEMINI_API_KEY` (either alone works), `SUPABASE_URL`, `SUPABASE_KEY` (service role), `ASSEMBLYAI_KEY` for dashboard creation (may live in `sentiment/.env`) |
| `sentiment/.env` | `sentiment/.env.example` | `SUPABASE_URL`, `SUPABASE_KEY` (service role) |
| `frontend/.env.local` | `frontend/.env.example` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key), `SUPABASE_SERVICE_ROLE_KEY` (account deletion); `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SENTIMENT_API_URL` for any deployed build |

Both APIs report missing or malformed required settings when they start; with `STRICT_CONFIG=1`
(set on Cloud Run) they refuse to start. `NEXT_PUBLIC_*` values are compiled into the frontend by
`next build`, so set them before building (the frontend Docker image requires them as build args).

The SQL in `docs/migrations/001`–`003` is optional: the app runs without it. 001 is needed only for the
home-worker queue (`YOUTUBE_HOME_WORKER=1`); 002 and 003 add chart metadata and summary/red-flag caching.

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

## Tests

```bash
pip install -r RAG/requirements-dev.txt -r sentiment/requirements-dev.txt
(cd RAG && pytest tests) && (cd sentiment && pytest tests)
cd frontend && npm test && npm run lint && npm run build
```

No API keys are needed: the Python tests use fake models and a fake Supabase client. `npm test` uses Node's built-in test runner on TypeScript files, which needs Node 22.18+.

## Deployment and recent changes

For a concise list of what changed (home YouTube worker, AssemblyAI options, frontend library fixes) and a **step-by-step deploy checklist** (Supabase, Cloud Run, Vercel, home worker), see **[docs/CHANGES_AND_DEPLOYMENT.md](docs/CHANGES_AND_DEPLOYMENT.md)**.

## Auth and Supabase SQL Setup

Run these SQL/setup docs in Supabase before testing auth/settings:

- `docs/supabase_profiles_migration.sql`
- `docs/supabase_avatars_storage.sql`
- `docs/AUTH_IMPLEMENTATION_STEPS.md`
- `docs/SUPABASE_SETTINGS_SETUP.md`

## Additional Docs

- Full local setup guide: `LOCAL_SETUP.md`
- Integration notes: `INTEGRATION_GUIDE.md`
- **Backend deployment (Cloud Run):** `docs/BACKEND_DEPLOYMENT_GUIDE.md` – How to add new backend functions and deploy to Cloud Run

singular driver script coming soon
