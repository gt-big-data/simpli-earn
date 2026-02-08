# Dashboard Creation Scripts

## Create Dashboard from YouTube Video

This script creates a complete new dashboard entry from a YouTube earnings call URL.

### What it does:

1. ✅ Downloads audio from YouTube video
2. ✅ Transcribes using **AssemblyAI** (high-quality transcription)
3. ✅ Runs sentiment analysis (relevance & specificity)
4. ✅ Uploads everything to Supabase
5. ✅ Creates database entry for new dashboard

### Prerequisites:

```bash
pip install assemblyai pytube python-dotenv supabase transformers torch
```

### Environment Variables Required:

The script looks for `.env` files in:
- `sentiment/.env`
- `RAG/.env`
- Root directory `.env`

Required variables:
```env
SUPABASE_URL=https://ciknjcwcbghtouqupnbr.supabase.co
SUPABASE_KEY=your_service_role_key
ASSEMBLYAI_KEY=your_assemblyai_key
YOUTUBE_API_KEY=your_youtube_key (optional - uses pytube as fallback)
```

### Usage:

```bash
# From the scripts directory
python create_dashboard_from_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID"

# Or from anywhere
python scripts/create_dashboard_from_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Example:

```bash
python create_dashboard_from_youtube.py "https://www.youtube.com/watch?v=5EVhGtYa1B0"
```

### Output:

The script will:
- Show progress for each step
- Upload transcript to Supabase `transcripts` bucket
- Upload sentiment CSVs to Supabase `sentiment` bucket
- Create entry in `video_analyses` table
- Provide a link to view the new dashboard

### Viewing the Result:

After successful completion, you can view the dashboard at:
```
http://localhost:3000/dashboard?video_url=<your_youtube_url>
```

### Troubleshooting:

**"Could not download audio"**
- YouTube video might be private or unavailable
- Try a different video

**"Transcription failed"**
- Check your AssemblyAI API key
- Make sure you have API credits

**"Sentiment analysis failed"**
- Check that transcript was uploaded to Supabase
- Verify Supabase credentials
- Make sure the sentiment analysis models can download (first run takes time)

**"Database entry failed"**
- Check Supabase connection
- Verify the `video_analyses` table exists

### Advanced Options:

To modify the script behavior, edit `create_dashboard_from_youtube.py`:

- Change ticker detection logic in `guess_ticker_from_title()`
- Modify sentiment analysis parameters
- Add custom metadata fields
- Change storage bucket names

### Notes:

- **First run** may take longer as ML models download
- **Transcription time** depends on video length (typically 1/4 of video duration)
- **Sentiment analysis** can take 5-10 minutes for a 1-hour call
- **Temp files** are automatically cleaned up after processing

