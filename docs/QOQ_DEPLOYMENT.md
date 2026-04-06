# Quarter-over-quarter (QoQ) comparison — deployment & onboarding

This guide explains what the QoQ feature does, which files to touch, and how to ship it safely to production. It is aimed at developers who are new to the repo.

---

## What the feature does (in one minute)

On the **dashboard** page, the charts area has three tabs: **Indicators**, **Sentiment**, and **Compare**.

- **Compare** lets users contrast two **preloaded** earnings transcripts (same company across quarters, or different companies).
- The **current** transcript comes from the dashboard URL (`?id=1` … `id=6` for the six featured companies).
- The **comparison** transcript is chosen from a dropdown. On Apple’s dashboard (`id=1`), the dropdown lists historical Apple quarters (e.g. Q4 FY2024 vs Q1 FY2025). On other dashboards, the dropdown lists the other preloaded companies.

All of this is **read-only analysis** over text files already in the backend container — no Supabase transcript lookup for `/compare`.

---

## Architecture at a glance

| Layer | Responsibility |
|--------|----------------|
| **Frontend (Vercel / Next.js)** | `ChartsFrame` adds the Compare tab; `QoQComparison` calls the API and renders charts + narrative shifts. |
| **Backend (Cloud Run — RAG API)** | `POST /compare` loads two transcripts from disk, runs word counts locally, and calls **OpenAI (`gpt-4o`)** once for sentiment scores and “narrative shifts”. |

The Compare API lives on the **same service** as summary, chat, stock, and indicators: the RAG backend (`simpli-earn-backend` in the deployment guide).

---

## Key files (where to look first)

| Area | Path | Notes |
|------|------|--------|
| Compare UI | `frontend/components/QoQComparison.tsx` | Labels, dropdown logic, `fetch` to `/compare`. |
| Tab wiring | `frontend/components/ChartsFrame.tsx` | Third tab state: `compareId`, `QoQComparison` mount. |
| API route | `RAG/api_chatbot.py` | `CompareRequest`, `STATIC_TRANSCRIPTS`, `POST /compare`. |
| Transcripts | `RAG/transcripts/*.txt` | Must exist in the image for every ID used in `STATIC_TRANSCRIPTS`. |

---

## Backend: `/compare` behavior

1. **Request body (JSON):**

   ```json
   {
     "current_id": "1",
     "previous_id": "aapl_2024Q4"
   }
   ```

   - `current_id` and `previous_id` must each be a key in `STATIC_TRANSCRIPTS` inside `api_chatbot.py`.

2. **Transcript map** — `STATIC_TRANSCRIPTS` includes:
   - `"1"` … `"6"` — the six default dashboards (Apple, CVS, Alphabet, Shell, Tesla, Walmart).
   - `"aapl_2024Q4"` … `"aapl_2023Q4"` — extra Apple quarter files for Apple-vs-Apple comparisons.

3. **Processing:**
   - Reads both `.txt` files from paths **relative to the RAG app working directory** (same as other transcript usage).
   - Counts a fixed set of “high-signal” words on the server (duplicated list in Python and frontend for display consistency).
   - One **OpenAI** completion (`gpt-4o`) returns structured JSON: sentiment scores (1–10), labels, and three narrative-shift strings.

4. **Secrets:** `OPENAI_API_KEY` must be available in Cloud Run (already wired in `cloudbuild.yaml` / deploy docs for the RAG service).

---

## Frontend: calling the API correctly

- Use the **same base URL** as the rest of the dashboard features:

  ```ts
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  // ...
  await fetch(`${apiUrl}/compare`, { method: "POST", ... });
  ```

- **Important:** The URL must be exactly `` `${apiUrl}/compare` `` — no extra `http://` prefix. `NEXT_PUBLIC_API_URL` in production must be the full HTTPS origin (e.g. `https://simpli-earn-backend-xxxxx-uc.a.run.app`). If you hardcode `http://` or break the URL, the browser will block the request (**mixed content**) on an HTTPS site like Vercel.

- **`NEXT_PUBLIC_*` variables are baked in at build time** — after changing them in Vercel, **redeploy** the frontend.

---

## CORS

The RAG app’s CORS middleware must include your production frontend origin (e.g. `https://simpli-earn-2.vercel.app`). If you add a new preview or custom domain, add it to `allow_origins` in `RAG/api_chatbot.py` or Compare requests from the browser will fail.

---

## Deployment checklist

When you **change Compare** (new transcripts, new IDs, or prompt logic):

1. Add transcript files under `RAG/transcripts/` and new keys to `STATIC_TRANSCRIPTS` in `api_chatbot.py`.
2. Update `QoQComparison.tsx` (`TRANSCRIPT_LABELS`, `APPLE_QUARTER_IDS`, dropdown rules) so IDs stay in sync with the backend.
3. **Rebuild and redeploy the RAG Cloud Run service** so the new files are in the Docker image.
4. Confirm `OPENAI_API_KEY` is still mounted on that service.

When you **only change the React UI** (copy, layout, fix fetch URL):

1. Deploy the **frontend** (Vercel). No backend redeploy required unless you also changed IDs or API shape.

---

## Local development

1. From the `RAG` directory, run the API (e.g. `uvicorn api_chatbot:app --reload --port 8000`).
2. From `frontend`, set `NEXT_PUBLIC_API_URL=http://localhost:8000` and run `npm run dev`.
3. Open e.g. `http://localhost:3000/dashboard?id=1`, open the **Compare** tab, and pick another quarter.

---

## Troubleshooting (quick)

| Symptom | Likely cause |
|---------|----------------|
| Mixed content / blocked request | Malformed URL (`http://` on HTTPS page) or wrong `NEXT_PUBLIC_API_URL`. |
| `Unknown current_id` / `Unknown previous_id` | Frontend sent an ID not in `STATIC_TRANSCRIPTS`, or backend image missing transcript files. |
| `GPT parse failure` / 503-style errors | OpenAI quota, invalid key, or model output not valid JSON. |
| CORS error | Frontend origin not listed in FastAPI `CORSMiddleware`. |

---

## Related documentation

- [BACKEND_DEPLOYMENT_GUIDE.md](./BACKEND_DEPLOYMENT_GUIDE.md) — Cloud Run deploy, secrets, env vars.
- [qoq_week_1_summary.md](../qoq_week_1_summary.md) — Product/iteration notes (if present in repo).
