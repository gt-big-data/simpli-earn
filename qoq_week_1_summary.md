# QoQ Analysis Engine — Week 1 Prototype Summary

**Date:** February 27, 2026
**Status:** Prototype functional, some widgets using placeholder logic (noted below)

---

## What Was Built

### 1. "Compare" Tab — UI Shell
A third tab was added to the Charts frame alongside the existing "Indicators" and "Sentiment" tabs. When clicked, it renders the QoQ Comparison component. The tab layout was updated from 2 equal-width tabs to 3.

**Files modified:**
- `frontend/components/ChartsFrame.tsx` — tab state extended, QoQComparison imported and rendered
- `frontend/components/QoQComparison.tsx` — new component (created from scratch)

---

### 2. Backend `/compare` Endpoint
A new `POST /compare` endpoint was added to `RAG/api_chatbot.py`.

**How it works:**
1. Accepts `{ current_id, previous_id }` identifying two transcripts
2. Reads both transcript `.txt` files from disk
3. Counts occurrences of 10 high-signal financial words in each transcript (real word counts)
4. Makes a single GPT-4o call asking it to compare both transcripts
5. Returns sentiment scores, narrative shifts, and word counts

**Request:**
```json
{ "current_id": "1", "previous_id": "aapl_2024Q4" }
```

---

### 3. Three Widgets in the Compare Tab

#### A. Sentiment Delta Widget
**⚠️ Current limitation: GPT-generated, not a real quantitative score.**
GPT-4o is asked to rate each transcript 1–10 for "confidence and positivity." The delta is the difference between the two scores. Because executives are trained to always sound positive, GPT consistently returns scores of 7–9, making the delta almost always +1 or 0. This widget looks convincing but is not analytically rigorous.

#### B. Vocabulary Heatmap (Bar Chart)
**✅ This is real data.**
A grouped bar chart showing how many times each of 10 high-signal words (`AI`, `headwinds`, `margins`, `recession`, `growth`, `guidance`, `uncertainty`, `challenges`, `record`, `supply chain`) appears in each transcript. Uses `react-chartjs-2` with Chart.js. The word counts are computed server-side with a simple case-insensitive string scan — no GPT involved.

This is genuinely useful. For example, "AI" appearing 67× in Q1 FY2025 vs 87× in Q2 FY2024 is a real signal about topic emphasis.

#### C. Narrative Shifts (3 Cards)
**Partially real — GPT-generated but grounded in actual transcript text.**
GPT-4o is given the first 6,000 characters of each transcript and asked to identify 3 concrete strategic pivots or contradictions between them. Quality depends on the transcripts selected. When comparing same-company quarters, the output is substantive and specific. When comparing different companies (non-Apple dashboards), it's less meaningful.

---

### 4. Alpha Vantage Integration — Apple Historical Data
Apple's last 5 quarters were fetched from the Alpha Vantage `EARNINGS_CALL_TRANSCRIPT` API (free tier, 25 req/day) and saved locally.

**Transcripts stored in `RAG/transcripts/`:**
| File | Quarter |
|---|---|
| `apple_2024Q4_seeking_alpha.txt` | Q4 FY2024 |
| `apple_2024Q3_seeking_alpha.txt` | Q3 FY2024 |
| `apple_2024Q2_seeking_alpha.txt` | Q2 FY2024 |
| `apple_2024Q1_seeking_alpha.txt` | Q1 FY2024 |
| `apple_2023Q4_seeking_alpha.txt` | Q4 FY2023 |

**Per-speaker sentiment JSON files also saved** (`apple_{quarter}_data.json`) — these contain Alpha Vantage's own per-speaker sentiment float scores (0.0–0.8 scale) and are the foundation for the real metrics planned in Week 2.

**Current dashboard behavior:**
- On the Apple dashboard (`id=1`), the Compare dropdown shows these 5 historical Apple quarters — enabling true same-company QoQ comparison
- On all other dashboards, the dropdown shows the other 5 preset companies (cross-company, not true QoQ)

---

## What Doesn't Work Yet / Honest Gaps

| Issue | Impact | Fix Required |
|---|---|---|
| Sentiment Delta is GPT 1-10, not real | Widget looks good but isn't analytically meaningful | Replace with AV per-speaker scores (see Week 2 plan) |
| Only Apple has historical data | QoQ Compare is only genuinely useful on the Apple dashboard | Fetch historical quarters for the other 5 preset companies |
| Transcripts stored locally only | Won't work in cloud/Docker deployment, not shared across users | Cache to Supabase Storage |
| User-uploaded videos have no QoQ | Compare tab shows for all dashboards but only Apple has history | Requires ticker association + on-demand fetch |
| No new-quarter automation | When Apple reports Q2 FY2025, nothing updates automatically | Earnings date trigger + auto-fetch |

---

## Week 2 Plan — Priority Order

### Priority 1: Fix the Sentiment Delta (2–3 hours)
Replace the GPT 1-10 score with computed metrics from Alpha Vantage's per-speaker sentiment data. Four metrics are already validated and ready to implement:

| Metric | What it measures | Why it matters |
|---|---|---|
| **Management Confidence** | Avg sentiment of CEO + CFO speaking turns | Direct measure of executive tone change |
| **CEO vs CFO Gap** | CEO avg minus CFO avg | CFOs hedge more; a widening gap signals the CEO is more optimistic than the numbers warrant |
| **Prepared Remarks vs Q&A Drop** | Exec sentiment in scripted section vs unscripted Q&A | Executives script prepared remarks; the Q&A is unguarded — a large drop means they're less confident when pressed |
| **Analyst Reception** | Avg sentiment of analyst questions | Proxy for how the street is feeling about the company |

The per-speaker JSON data is already on disk. This only requires updating the `/compare` endpoint and the frontend widget — no additional API calls.

### Priority 2: Add Historical Data for Other Preset Companies (1–2 hours)
Fetch 4–5 quarters for CVS, Alphabet, Shell, Tesla, and Walmart using the same Alpha Vantage pipeline. At 25 requests/day free tier and 5 quarters per company, this is 25 requests = 1 day of free fetching. No cost.

### Priority 3: Supabase Caching (3–4 hours)
Store fetched transcripts and sentiment JSON in Supabase Storage. On `/compare` request, check Supabase first before hitting Alpha Vantage. This:
- Makes the feature work in the cloud deployment
- Prevents re-fetching data that's already been retrieved
- Allows transcripts to be shared across users

### Priority 4: API Tier Decision
**Current:** Alpha Vantage free tier — 25 requests/day, 5/minute.

This is sufficient for:
- All 6 preset companies × 5 quarters = 30 one-time requests ✅
- New quarterly updates = 6 requests per earnings season ✅
- A handful of user-uploaded companies per day ✅

**Upgrade trigger:** If user-uploaded tickers scale to more than ~5 new, unique companies per day simultaneously, the daily cap becomes a constraint. The $50/month plan removes the daily cap entirely. **Recommendation: stay on free tier until the product gets real users.**

---

## Testing the Prototype

1. Start backend: `cd RAG && uvicorn api_chatbot:app --reload --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to: `http://localhost:3000/dashboard?id=1` (Apple dashboard)
4. Click the **Compare** tab
5. The dropdown will default to "Apple Q4 FY2024" — the most recent prior quarter
6. Change the dropdown to test other quarters
7. Observe: Vocabulary Heatmap updates with real data; Sentiment Delta updates (note: currently GPT-scored); Narrative Shifts shows 3 GPT-generated pivots

**Direct API test:**
```bash
curl -s -X POST http://localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{"current_id":"1","previous_id":"aapl_2024Q4"}' | python3 -m json.tool
```

---

## Files Created / Modified This Week

| File | Status | Notes |
|---|---|---|
| `RAG/api_chatbot.py` | Modified | Added `/compare` endpoint, `HIGH_SIGNAL_WORDS`, `CompareRequest` model |
| `frontend/components/ChartsFrame.tsx` | Modified | Added Compare tab, `compareId` state, QoQComparison render |
| `frontend/components/QoQComparison.tsx` | Created | Full QoQ comparison component |
| `RAG/.env` | Modified | Added `ALPHA_VANTAGE_KEY` |
| `RAG/transcripts/apple_2024Q{1-4}_seeking_alpha.txt` | Created | 4 Apple historical quarters |
| `RAG/transcripts/apple_2023Q4_seeking_alpha.txt` | Created | Apple Q4 FY2023 |
| `RAG/transcripts/apple_2024Q{1-4}_data.json` | Created | Per-speaker sentiment JSON |
| `RAG/transcripts/apple_2023Q4_data.json` | Created | Per-speaker sentiment JSON |
