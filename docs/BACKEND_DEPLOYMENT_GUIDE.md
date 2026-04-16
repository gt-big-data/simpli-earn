# Backend Deployment Guide: Adding New Functions to Cloud Run

This guide documents how to add new backend functionality to SimpliEarn and deploy it to Google Cloud Run. Use it when creating new API endpoints that need to run in production (e.g., on Vercel or a hosted frontend).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Decision: Add to Existing Service vs. New Service](#decision-add-to-existing-service-vs-new-service)
3. [Option A: Add to RAG API (Recommended for Most Cases)](#option-a-add-to-rag-api-recommended-for-most-cases)
4. [Option B: Add to Sentiment API](#option-b-add-to-sentiment-api)
5. [Option C: Create a New Cloud Run Service](#option-c-create-a-new-cloud-run-service)
6. [Frontend Changes Required](#frontend-changes-required)
7. [Deployment Commands](#deployment-commands)
8. [Secrets Management](#secrets-management)
9. [Vercel Configuration](#vercel-configuration)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview


| Service           | Cloud Run Name                   | Purpose                                                              | Port (local) |
| ----------------- | -------------------------------- | -------------------------------------------------------------------- | ------------ |
| **RAG API**       | `simpli-earn-backend`            | Summary, chat, stock charts, economic indicators, dashboard creation | 8000         |
| **Sentiment API** | `simpli-earn-sentiment`          | Sentiment analysis, library, transcript storage                      | 8001         |
| **Frontend**      | Vercel or `simpli-earn-frontend` | Next.js app                                                          | 3000         |


**Important:** Vercel serverless functions **cannot** run Python subprocesses. Any logic that spawns Python (e.g., `/api/stock`, `/api/indicators`) must run on Cloud Run, not in Next.js API routes.

---

## Decision: Add to Existing Service vs. New Service


| Scenario                                                                    | Recommendation            |
| --------------------------------------------------------------------------- | ------------------------- |
| New endpoint uses same dependencies as RAG (yfinance, pandas, OpenAI, etc.) | **Add to RAG API**        |
| New endpoint uses sentiment/Supabase/AssemblyAI                             | **Add to Sentiment API**  |
| New endpoint has completely different stack or scaling needs                | **New Cloud Run service** |


---

## Option A: Add to RAG API (Recommended for Most Cases)

Use this when your new function uses Python libraries already in `RAG/requirements.txt` (e.g., yfinance, pandas, langchain).

### Step 1: Add Your Python Logic

**Option 1a – Import from a module (preferred):**

1. Create or copy your Python script into `RAG/` (e.g., `RAG/my_new_script.py`).
2. In `RAG/api_chatbot.py`, add the endpoint:

```python
@app.post("/my-new-endpoint")
def my_new_endpoint(payload: dict = Body(...)):
    """Description of what this does."""
    param1 = payload.get("param1")
    param2 = payload.get("param2", default_value)

    if not param1:
        return {"ok": False, "error": "param1 required"}

    from my_new_script import my_function
    return my_function(param1, param2)
```

**Option 1b – Subprocess (for scripts with CLI args):**

```python
@app.post("/my-new-endpoint")
def my_new_endpoint(payload: dict = Body(...)):
    """Runs a Python script via subprocess."""
    param1 = payload.get("param1")
    param2 = payload.get("param2")

    if not param1:
        return {"error": "param1 required"}

    process = subprocess.Popen(
        ["python3", "my_script.py", param1, param2],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=os.environ
    )
    out, err = process.communicate(timeout=60)

    if process.returncode != 0:
        return {"error": err}

    return json.loads(out)
```

### Step 2: Add Dependencies (if needed)

Add any new packages to `RAG/requirements.txt`.

### Step 3: Update Frontend

In your React component, use the RAG API URL:

```tsx
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const response = await fetch(`${apiUrl}/my-new-endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ param1: value1, param2: value2 }),
});
```

### Step 4: Deploy

See [Deployment Commands](#deployment-commands) below.

---

## Option B: Add to Sentiment API

Use this when your new function fits the sentiment/Supabase/AssemblyAI domain.

1. Add your endpoint in `sentiment/api.py`.
2. Add the route and logic.
3. Ensure the frontend uses `NEXT_PUBLIC_SENTIMENT_API_URL` (see [Frontend Changes](#frontend-changes-required)).
4. Deploy the sentiment service (see [Deployment Commands](#deployment-commands)).

---

## Option C: Create a New Cloud Run Service

Use this when:

- The stack is different (e.g., different runtime, heavy dependencies).
- You want independent scaling or deployment.

### Steps

1. **Create directory structure:**

```
my-new-service/
├── Dockerfile
├── requirements.txt
├── main.py          # FastAPI app
└── your_script.py   # Your logic
```

1. **Dockerfile:**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn
COPY . .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

1. **main.py:**

```python
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/my-endpoint")
def my_endpoint(payload: dict = Body(...)):
    # Your logic
    return {"result": "ok"}
```

1. **Add to `cloudbuild.yaml`** – duplicate the sentiment build/deploy steps and adjust names/context.
2. **Add env var** – e.g. `NEXT_PUBLIC_MY_SERVICE_URL` in Vercel.

---

## Frontend Changes Required

### Never hardcode URLs

❌ Bad:

```tsx
const response = await fetch("http://localhost:8000/summary");
const response = await fetch("/api/indicators");  // Fails on Vercel!
```

✅ Good:

```tsx
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const response = await fetch(`${apiUrl}/summary`);
```

### Env vars by service


| Service       | Env Var                         | Purpose                                   |
| ------------- | ------------------------------- | ----------------------------------------- |
| RAG API       | `NEXT_PUBLIC_API_URL`           | Summary, chat, stock, economic indicators |
| Sentiment API | `NEXT_PUBLIC_SENTIMENT_API_URL` | Sentiment data, library                   |


### `NEXT_PUBLIC_*` behavior

- These are baked in at **build time**.
- After changing them in Vercel, you must **redeploy** the frontend.
- Never put secrets in `NEXT_PUBLIC_`* variables.

---

## Deployment Commands

### Prerequisites

- `gcloud` CLI installed and authenticated
- Project set: `gcloud config set project simpliearn-452813`

### Full deployment (all services)

```bash
gcloud builds submit --config=cloudbuild.yaml .
```

### Deploy only RAG backend

Build **from the repository root** (not `RAG/`). The image includes `RAG/`, `scripts/create_dashboard_from_youtube.py`, and `sentiment/` so custom YouTube dashboards work on Cloud Run.

```bash
# Build (Docker)
docker build -f RAG/Dockerfile -t gcr.io/simpliearn-452813/simpli-earn-backend:latest .
docker push gcr.io/simpliearn-452813/simpli-earn-backend:latest

# Or use Cloud Build with the same context as cloudbuild.yaml (submit from repo root).
# Deploy to Cloud Run
gcloud run deploy simpli-earn-backend \
  --image gcr.io/simpliearn-452813/simpli-earn-backend:1ccbc92 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,SUPABASE_URL=supabase-url:latest,SUPABASE_KEY=supabase-key:latest,ASSEMBLYAI_KEY=assemblyai-key:latest,HF_TOKEN=hf-token:latest,GEMINI_API_KEY=gemini-api-key:latest,YOUTUBE_API_KEY=youtube-api-key:latest"
```

To avoid YouTube **429** on Cloud Run, enqueue jobs for a home worker instead of running `yt-dlp` in this service: add **`YOUTUBE_HOME_WORKER=1`** (plain env var or Secret Manager). Run the SQL in `docs/migrations/001_youtube_jobs.sql`, then run `scripts/home_youtube_worker.py` on a residential machine. Details: **[HOME_YOUTUBE_WORKER.md](./HOME_YOUTUBE_WORKER.md)**.

### Deploy only Sentiment backend

```bash
# Build
gcloud builds submit --tag gcr.io/simpliearn-452813/simpli-earn-sentiment:latest sentiment

# Deploy to Cloud Run
gcloud run deploy simpli-earn-sentiment \
  --image gcr.io/simpliearn-452813/simpli-earn-sentiment:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --set-secrets "SUPABASE_URL=supabase-url:latest,SUPABASE_KEY=supabase-key:latest,ASSEMBLYAI_KEY=assemblyai-key:latest,HF_TOKEN=hf-token:latest"
```

### Get service URLs

```bash
# RAG API
gcloud run services describe simpli-earn-backend --region us-central1 --format='value(status.url)'

# Sentiment API
gcloud run services describe simpli-earn-sentiment --region us-central1 --format='value(status.url)'
```

---

## Secrets Management

### How `--set-secrets` works

You do **not** put the actual secret values in the deploy command. You reference secrets in Secret Manager:

```
ENV_VAR_NAME=SECRET_NAME:VERSION
```

Example: `OPENAI_API_KEY=openai-api-key:latest` means:

- Use the secret named `openai-api-key`
- Use version `latest`
- Set the container env var `OPENAI_API_KEY` to that value

### Adding a new secret

1. Create secret:

```bash
echo -n "your-actual-value" | gcloud secrets create my-secret-name --data-file=- --project=simpliearn-452813
```

1. Grant access:

```bash
gcloud projects add-iam-policy-binding simpliearn-452813 \
  --member="serviceAccount:976485872075-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

1. Add to deploy:

```bash
--set-secrets "...,MY_VAR=my-secret-name:latest"
```

### Update existing secret

```bash
echo -n "new-value" | gcloud secrets versions add openai-api-key --data-file=- --project=simpliearn-452813
```

---

## Vercel Configuration

For Vercel-hosted frontends:

1. **Project → Settings → Environment Variables**
2. Add or update:
  - `NEXT_PUBLIC_API_URL` = RAG API Cloud Run URL
  - `NEXT_PUBLIC_SENTIMENT_API_URL` = Sentiment API Cloud Run URL
3. Redeploy after changing env vars.

---

## Troubleshooting

### CORS errors

- Ensure the backend has CORS middleware configured.
- Add your frontend origin if using explicit origins (e.g. `https://simpli-earn-2.vercel.app`).

### 503 errors

- **"AI service error" / "Connection error"** – Check OpenAI/Gemini API keys and quotas.
- **"Permission denied on secret"** – Grant `roles/secretmanager.secretAccessor` to the Cloud Run service account.

### 504 Gateway Timeout

- **Cold start** – First request after idle can take 30–60+ seconds. Options:
  - `--min-instances 1` to avoid cold starts (higher cost)
  - `--timeout 300` to allow longer requests
  - User retries after first failure
- **Request hitting wrong URL** – If the request goes to `vercel.app/api/...`, the frontend is still using the old Next.js API route. Deploy the updated frontend that uses `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SENTIMENT_API_URL`.

### Frontend still uses old endpoint

- Ensure `NEXT_PUBLIC_`* env vars are set in Vercel.
- Redeploy the frontend after changes.
- Commit and push frontend changes so Vercel deploys the latest code.

### Verify deployment

```bash
# Test RAG endpoint
curl "https://YOUR-RAG-URL/summary?id=1"

# Test sentiment endpoint
curl -X POST "https://YOUR-SENTIMENT-URL/sentiment/get-by-video" \
  -H "Content-Type: application/json" \
  -d '{"dashboard_id":"1","video_url":null}'
```

---

## Quick Reference: Service → Endpoint Mapping


| Frontend Feature    | Backend Service | Endpoint                                                       |
| ------------------- | --------------- | -------------------------------------------------------------- |
| Summary             | RAG             | `GET /summary?id=1`                                            |
| Chat                | RAG             | `POST /chat`                                                   |
| Stock chart         | RAG             | `POST /generate-stock`                                         |
| Economic indicators | RAG             | `POST /generate-indicators`                                    |
| QoQ Compare tab     | RAG             | `POST /compare` (see [QOQ_DEPLOYMENT.md](./QOQ_DEPLOYMENT.md)) |
| Dashboard creation  | RAG             | `POST /dashboard/create-dashboard`                             |
| Sentiment chart     | Sentiment       | `POST /sentiment/get-by-video`                                 |
| Library             | Sentiment       | `GET /library`                                                 |


---

## Related Docs

- [QOQ_DEPLOYMENT.md](./QOQ_DEPLOYMENT.md) – Quarter-over-quarter Compare tab and `/compare` deploy notes
- [SECRET_SETUP.md](../SECRET_SETUP.md) – Secret Manager setup
- [LOCAL_SETUP.md](../LOCAL_SETUP.md) – Local development
- [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) – Overall integration

