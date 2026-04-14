# Recent changes and deployment guide

This document summarizes notable updates to the SimpliEarn repo and how to roll them out (Supabase, Cloud Run, Vercel, home worker).

---

## What changed (summary)

### 1. Home YouTube worker (429 mitigation on Cloud Run)

**Problem:** YouTube often returns **HTTP 429** when `yt-dlp` runs from **Cloud Run** (datacenter IPs).

**Solution:** Optional mode where the **RAG API only enqueues** work in Supabase; a **PC/Mac/Pi on residential Wi‑Fi** runs `yt-dlp` and the full `create_dashboard_from_youtube.py` pipeline.

| Area | Files / artifacts |
|------|-------------------|
| DB | [`docs/migrations/001_youtube_jobs.sql`](./migrations/001_youtube_jobs.sql) — table `youtube_jobs` |
| RAG API | [`RAG/create_dashboard_endpoint.py`](../RAG/create_dashboard_endpoint.py) — `YOUTUBE_HOME_WORKER=1` → insert row; job status from Supabase |
| Worker | [`scripts/home_youtube_worker.py`](../scripts/home_youtube_worker.py) — poll, claim, run pipeline |
| Docs | [`docs/HOME_YOUTUBE_WORKER.md`](./HOME_YOUTUBE_WORKER.md) |

### 2. YouTube dashboard pipeline (`create_dashboard_from_youtube.py`)

- **AssemblyAI CLI first (optional):** If `assemblyai` is on `PATH` and `USE_ASSEMBLYAI_CLI_FOR_YOUTUBE` is not disabled, transcribe with `assemblyai transcribe "<url>" -j` using a temporary `HOME` for config. Falls back to **yt-dlp / pytube + Python SDK**.
- **Python SDK transcription config:** `ASSEMBLYAI_BASE_URL`, `TranscriptionConfig` with `speech_models`, `language_detection`, `speaker_labels` (overridable via env). `ASSEMBLYAI_MINIMAL_TRANSCRIBE=1` restores simple `transcribe(file)` without that config.
- Env knobs: `ASSEMBLYAI_CLI_BIN`, `ASSEMBLYAI_CLI_TIMEOUT_SEC`, `USE_ASSEMBLYAI_CLI_FOR_YOUTUBE`, `ASSEMBLYAI_SPEECH_MODELS`, etc. See [`sentiment/.env.example`](../sentiment/.env.example).

### 3. Frontend home page — library and APIs

[`frontend/app/(landing-pages)/page.tsx`](../frontend/app/(landing-pages)/page.tsx)

- **`NEXT_PUBLIC_SENTIMENT_API_URL`** for `/library` and delete (no longer hardcoded `localhost:8001`).
- Refetch library on **tab visibility** and after a **completed** create-dashboard poll.
- Safer dashboard links (`encodeURIComponent`, `www.youtube.com` watch URL).
- Stable React keys: `video.id ?? video.video_identifier`.

### 4. Documentation updates

- [`LOCAL_SETUP.md`](../LOCAL_SETUP.md) — AssemblyAI CLI, home-worker pointer, pipeline wording.
- [`scripts/README.md`](../scripts/README.md) — CLI vs yt-dlp flow.
- [`docs/BACKEND_DEPLOYMENT_GUIDE.md`](./BACKEND_DEPLOYMENT_GUIDE.md) — `YOUTUBE_HOME_WORKER` note for RAG deploy.

---

## How to deploy

### A. Supabase (once per project)

1. Open **Supabase Dashboard → SQL** and run [`docs/migrations/001_youtube_jobs.sql`](./migrations/001_youtube_jobs.sql) if you use the **home worker** path.
2. Confirm buckets **`transcripts`** and **`sentiment`** exist and policies match your app (unchanged by this doc).
3. Ensure **`video_analyses`** table still matches your app (unchanged here).

### B. RAG backend (Cloud Run or local)

**Secrets / env (typical):**

- `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (service role), plus any existing keys (`GEMINI_API_KEY`, etc.).
- **`YOUTUBE_HOME_WORKER=1`** — enable queue-only mode for YouTube jobs (requires migration + home worker).
- Omit or set **`YOUTUBE_HOME_WORKER=0`** for classic mode (subprocess on the same host as uvicorn).

**Deploy** (adjust image, project, region to yours):

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/simpli-earn-backend:latest RAG

gcloud run deploy simpli-earn-backend \
  --image gcr.io/YOUR_PROJECT/simpli-earn-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,SUPABASE_URL=supabase-url:latest,SUPABASE_KEY=supabase-key:latest,..." \
  --set-env-vars "YOUTUBE_HOME_WORKER=1"
```

Use **Secret Manager** for sensitive values; use `--set-env-vars` only for non-secret flags like `YOUTUBE_HOME_WORKER` if you prefer.

**Local RAG:** `cd RAG && uvicorn api_chatbot:app --host 0.0.0.0 --port 8000` with `RAG/.env`. Do **not** set `YOUTUBE_HOME_WORKER` unless you intend to test the queue + worker.

### C. Sentiment API (Cloud Run)

Unchanged pattern; deploy `sentiment/` image with `SUPABASE_*`, `ASSEMBLYAI_KEY`, `HF_TOKEN` as before. See [`docs/BACKEND_DEPLOYMENT_GUIDE.md`](./BACKEND_DEPLOYMENT_GUIDE.md).

### D. Frontend (Vercel or other)

Set:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (**anon** key only, not service role).
- `NEXT_PUBLIC_API_URL` — HTTPS URL of **RAG** Cloud Run service.
- `NEXT_PUBLIC_SENTIMENT_API_URL` — HTTPS URL of **sentiment** Cloud Run service.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, for routes like delete-account (if used).

Redeploy after env changes.

### E. Home YouTube worker (when `YOUTUBE_HOME_WORKER=1`)

On a machine on **residential internet**:

1. Clone repo, `python3 -m venv venv`, `pip install -r RAG/requirements.txt -r sentiment/requirements.txt` (+ `assemblyai`, `yt-dlp` as needed).
2. Copy **`sentiment/.env`** with `SUPABASE_URL`, `SUPABASE_KEY`, `ASSEMBLYAI_KEY`, `HF_TOKEN`, etc.
3. From repo root:

```bash
source venv/bin/activate
python scripts/home_youtube_worker.py
```

See [`docs/HOME_YOUTUBE_WORKER.md`](./HOME_YOUTUBE_WORKER.md) for cron (`HOME_YOUTUBE_ONCE=1`) and tuning.

---

## Rollout checklist

| Step | Action |
|------|--------|
| 1 | Run `001_youtube_jobs.sql` in Supabase if using home worker |
| 2 | Deploy RAG with correct secrets + optional `YOUTUBE_HOME_WORKER=1` |
| 3 | Deploy sentiment API |
| 4 | Deploy frontend with `NEXT_PUBLIC_*` URLs |
| 5 | Start **home worker** if step 2 used worker mode |
| 6 | Smoke test: home page submit URL → poll job → open dashboard |

---

## Rollback

- Set **`YOUTUBE_HOME_WORKER=0`** or remove it on RAG; redeploy. API returns to **in-process** `create_dashboard_from_youtube.py` (YouTube runs on Cloud Run again — 429 may return).
- Frontend changes are backward compatible with existing APIs.

---

## Further reading

- [HOME_YOUTUBE_WORKER.md](./HOME_YOUTUBE_WORKER.md) — home worker detail  
- [BACKEND_DEPLOYMENT_GUIDE.md](./BACKEND_DEPLOYMENT_GUIDE.md) — Cloud Build / Run patterns  
- [LOCAL_SETUP.md](../LOCAL_SETUP.md) — local dev  
