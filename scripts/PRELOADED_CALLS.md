# Processing Pre-loaded Earnings Calls

This guide explains how to process the 6 pre-loaded earnings call transcripts that are already stored locally in the `RAG/transcripts/` directory.

## What This Does

The script will:
1. ✅ Read existing transcripts from `RAG/transcripts/`
2. ✅ Upload them to Supabase storage
3. ✅ Run sentiment analysis (relevance & specificity)
4. ✅ Create database entries in `video_analyses` table
5. ✅ Make the dashboards fully functional with sentiment graphs

## Pre-loaded Calls

| ID | Company | Ticker | File |
|----|---------|--------|------|
| 1  | Apple   | AAPL   | `apple_seeking_alpha.txt` |
| 2  | CVS Health | CVS | `cvs_seeking_alpha.txt` |
| 3  | Alphabet (Google) | GOOGL | `alphabet_seeking_alpha.txt` |
| 4  | Shell   | SHEL   | `shell_seeking_alpha.txt` |
| 5  | Tesla   | TSLA   | `tesla_seeking_alpha.txt` |
| 6  | Walmart | WMT    | `walmart_seeking_alpha.txt` |

## Usage

### Process a Single Call

To process just one dashboard (recommended for testing):

```bash
cd /Users/gauri/gauri_codes/simpliEarn/simplifinal/simpli-earn

# Process Apple (Dashboard 1)
python3 scripts/process_preloaded_calls.py --id 1

# Process Tesla (Dashboard 5)
python3 scripts/process_preloaded_calls.py --id 5
```

**Time:** ~5-7 minutes per call

### Process All Calls

To process all 6 pre-loaded dashboards at once:

```bash
python3 scripts/process_preloaded_calls.py --all
```

**Time:** ~30-45 minutes total

## What You'll See

For each call, the script will:

```
============================================================
📞 Processing: Apple Q1 FY25 Earnings Call
============================================================
🏷️  Dashboard ID: 1
📹 Video ID: dC9yOuhiNrk
💹 Ticker: AAPL
📄 Transcript file: apple_seeking_alpha.txt
📤 Uploading transcript for AAPL...
✅ Transcript uploaded: aapl_dC9yOuhiNrk_20251120_154230_transcript.txt
📊 Running sentiment analysis for AAPL...
  → Analyzing relevance...
  ✅ Relevance analysis complete
  → Analyzing specificity...
  ✅ Specificity analysis complete
💿 Creating database entry for AAPL...
✅ Database entry created for AAPL
   📝 Transcript: aapl_dC9yOuhiNrk_20251120_154230_transcript.txt
   📊 Relevance: aapl_dC9yOuhiNrk_20251120_154230_relevance.csv
   📊 Specificity: aapl_dC9yOuhiNrk_20251120_154230_specificity.csv

============================================================
✅ SUCCESS! AAPL processed
============================================================
🔗 View at: http://localhost:3000/dashboard?id=1
```

## After Processing

Once processed, you can view the dashboards at:

- **Dashboard 1 (Apple):** http://localhost:3000/dashboard?id=1
- **Dashboard 2 (CVS):** http://localhost:3000/dashboard?id=2
- **Dashboard 3 (Google):** http://localhost:3000/dashboard?id=3
- **Dashboard 4 (Shell):** http://localhost:3000/dashboard?id=4
- **Dashboard 5 (Tesla):** http://localhost:3000/dashboard?id=5
- **Dashboard 6 (Walmart):** http://localhost:3000/dashboard?id=6

Each dashboard will now have:
- ✅ Video (embedded YouTube player)
- ✅ Summary (AI-generated from transcript)
- ✅ Indicators (stock charts)
- ✅ Sentiment graphs (relevance & specificity)
- ✅ Chat (RAG-powered Q&A)

## Troubleshooting

### Missing HuggingFace Token

If you see:
```
401 Client Error: Unauthorized for url: https://huggingface.co/...
```

Make sure your HuggingFace token is set in the `.env` file:
```bash
echo 'HF_TOKEN=your_token_here' >> /Users/gauri/gauri_codes/simpliEarn/simplifinal/simpli-earn/sentiment/.env
```

### Supabase Connection Error

If you see:
```
❌ Missing SUPABASE_URL or SUPABASE_KEY in environment
```

Make sure your Supabase credentials are in the `.env` file:
```bash
cat /Users/gauri/gauri_codes/simpliEarn/simplifinal/simpli-earn/sentiment/.env
```

### Process Takes Too Long

Each sentiment analysis takes 5-7 minutes because it:
- Splits transcript into sentences
- Analyzes each sentence with transformer models
- Generates relevance and specificity scores

This is normal. You can:
- Process one at a time (`--id 1`)
- Let it run in the background
- Process all at once overnight (`--all`)

## Re-processing

If you need to re-process a call (e.g., after fixing an error), just run the command again. The script will update the existing database entry.

```bash
python3 scripts/process_preloaded_calls.py --id 1
```

## Notes

- The script uses the same sentiment analysis pipeline as the YouTube video processor
- Transcripts are re-uploaded to Supabase even if they already exist (upsert)
- Database entries are upserted, so re-running is safe
- Original transcript files in `RAG/transcripts/` are not modified

