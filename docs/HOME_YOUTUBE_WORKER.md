# Home YouTube worker (avoid 429 on Cloud Run)

Cloud Run egress IPs are often throttled by YouTube. This flow **never runs yt-dlp on Cloud Run**: the RAG API only **enqueues** rows in Supabase; a **PC/Mac/Pi on your home Wi‑Fi** runs `yt-dlp` and the existing `create_dashboard_from_youtube.py` pipeline.

## 1. Create the table

In **Supabase → SQL → New query**, run:

[`docs/migrations/001_youtube_jobs.sql`](./migrations/001_youtube_jobs.sql)

## 2. Cloud Run (RAG service)

Set:

```text
YOUTUBE_HOME_WORKER=1
```

Keep **`SUPABASE_URL`** and **`SUPABASE_KEY`** (service role) on the RAG service so it can insert/read `youtube_jobs`.

Redeploy. `POST /dashboard/create-dashboard` will insert a row and return `job_id`; it will **not** start `yt-dlp` on Cloud Run.

## 3. Home machine

1. Clone the repo and use the same **venv** / deps as local setup (`pip install -r RAG/requirements.txt -r sentiment/requirements.txt`, plus `assemblyai`, `yt-dlp`, etc.).
2. Copy **`sentiment/.env`** (or export `SUPABASE_URL`, `SUPABASE_KEY`, `ASSEMBLYAI_KEY`, `HF_TOKEN`, …).
3. Run from **repo root**:

```bash
source venv/bin/activate
python scripts/home_youtube_worker.py
```

Optional:

- `HOME_YOUTUBE_POLL_SEC` (default `15`) — sleep when idle.
- `HOME_YOUTUBE_ONCE=1` — process one job then exit (for **cron**).
- `HOME_YOUTUBE_SCRIPT_TIMEOUT_SEC` — max seconds per pipeline run (default `7200`).

## 4. Frontend

No code changes required. The home page still polls `GET /dashboard/job-status/{job_id}`; statuses are **`pending` → `running` → `completed` / `failed`** from the table.

## 5. Local RAG without worker

Unset `YOUTUBE_HOME_WORKER` (or set to `0`). Behavior returns to **in-memory jobs + subprocess** on the same machine as uvicorn.

## Security

- `youtube_jobs` has **RLS enabled** and **no** policies for anon/authenticated clients; only the **service role** (backend + worker) should access this table.
- Do not expose the service role key in the browser.
