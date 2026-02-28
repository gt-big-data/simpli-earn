# SimpliEarn - Full Integration Guide

## 🎉 What's New

Your SimpliEarn platform now has **complete end-to-end automation** for creating dashboards from YouTube earnings calls!

---

## 🚀 Features Implemented

### 1. **Automated Dashboard Creation**
- Paste any YouTube earnings call link
- System automatically:
  - Downloads audio
  - Transcribes with AssemblyAI (high quality)
  - Runs sentiment analysis
  - Uploads to Supabase
  - Creates database entry
- Real-time progress tracking
- Auto-redirect to new dashboard when complete

### 2. **Dynamic Library**
- Library loads from Supabase database
- Shows both preset calls AND user-uploaded calls
- Real-time updates

### 3. **Delete Functionality**
- Hover over any custom video card
- Red delete button appears
- Confirmation dialog
- Deletes from database AND removes all files

### 4. **Full RAG Support**
- New dashboards work with chatbot automatically
- Sentiment analysis displays correctly
- All features work for custom uploads

---

## 📡 API Endpoints

### RAG API (Port 8000)

**Create Dashboard:**
```http
POST http://localhost:8000/dashboard/create-dashboard
Content-Type: application/json

{
  "youtube_url": "https://www.youtube.com/watch?v=..."
}

Response: {
  "job_id": "uuid",
  "status": "pending",
  "message": "Dashboard creation started"
}
```

**Check Job Status:**
```http
GET http://localhost:8000/dashboard/job-status/{job_id}

Response: {
  "job_id": "uuid",
  "status": "completed|running|pending|failed",
  "video_id": "youtube_video_id",
  "error": null
}
```

**List All Jobs:**
```http
GET http://localhost:8000/dashboard/jobs
```

### Sentiment API (Port 8001)

**Get Library:**
```http
GET http://localhost:8001/library

Response: {
  "videos": [
    {
      "id": "...",
      "video_identifier": "youtube_video_id",
      "metadata": {
        "title": "...",
        "ticker": "AAPL",
        "upload_date": "..."
      },
      "transcript_filename": "...",
      "relevance_filename": "...",
      "specificity_filename": "..."
    }
  ]
}
```

**Delete from Library:**
```http
DELETE http://localhost:8001/library/{video_identifier}

Response: {
  "message": "Deleted video_id",
  "success": true
}
```

---

## 🎯 User Flow

### Creating a New Dashboard:

1. **User goes to homepage** (http://localhost:3000)
2. **Pastes YouTube link** in the search box
3. **Clicks submit button**
4. **System shows:**
   - Loading spinner
   - Status updates ("Processing video...")
   - Progress messages
5. **When complete:**
   - Success message
   - Auto-redirect to dashboard
   - New video appears in library

### Viewing a Dashboard:

**For Preset Videos:**
```
http://localhost:3000/dashboard?id=1
```

**For Custom Videos:**
```
http://localhost:3000/dashboard?video_url=https://youtube.com/watch?v=...
```

**All features work:**
- ✅ Video playback
- ✅ Transcript with timestamps
- ✅ Sentiment graphs
- ✅ Stock charts
- ✅ Economic indicators
- ✅ AI Chatbot (RAG)
- ✅ Summary generation

### Deleting a Video:

1. **Hover** over a custom video card in the library
2. **Red trash icon** appears in top-right
3. **Click** the icon
4. **Confirm** deletion
5. Video and all associated data are removed

---

## 🔧 Technical Details

### Background Processing

Dashboard creation runs as a **background job** to avoid timeouts:
- Audio download: ~1-2 minutes
- Transcription (AssemblyAI): ~video_length/4
- Sentiment analysis: ~5-10 minutes for 1-hour call
- **Total**: 10-15 minutes for typical earnings call

The frontend polls every 3 seconds to check status.

### Data Flow

```
YouTube URL
    ↓
[Download Audio] → pytube
    ↓
[Transcribe] → AssemblyAI
    ↓
[Save to Supabase] → transcripts bucket
    ↓
[Sentiment Analysis] → transformers + torch
    ↓
[Save Results] → sentiment bucket
    ↓
[Create DB Entry] → video_analyses table
    ↓
[Frontend Updates] → Dynamic library
```

### Database Schema

**Table: `video_analyses`**
```sql
{
  id: uuid,
  video_identifier: string (YouTube video ID),
  transcript_filename: string,
  relevance_filename: string,
  specificity_filename: string,
  metadata: jsonb {
    title: string,
    ticker: string,
    upload_date: string,
    description: string
  },
  created_at: timestamp,
  updated_at: timestamp
}
```

### File Storage

**Supabase Buckets:**
- `transcripts/` - Raw transcript text files
- `sentiment/` - CSV files with sentiment scores

---

## 🚦 Running the System

### Start All Services:

```bash
# Terminal 1 - RAG API (port 8000)
cd RAG
uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Sentiment API (port 8001)
cd sentiment
uvicorn api:app --reload --host 0.0.0.0 --port 8001

# Terminal 3 - Frontend (port 3000)
cd frontend
npm run dev
```

### Environment Variables Required:

**In `sentiment/.env`:**
```env
SUPABASE_URL=https://ciknjcwcbghtouqupnbr.supabase.co
SUPABASE_KEY=your_service_role_key
ASSEMBLYAI_KEY=4c9131d7252a4a9f9872c315b2547c37
```

**In `RAG/.env`:**
```env
OPENAI_API_KEY=your_openai_key
```

---

## 🧪 Testing

### Test Dashboard Creation:

```bash
# Run the script directly
python scripts/create_dashboard_from_youtube.py "https://www.youtube.com/watch?v=5EVhGtYa1B0"

# Or test via API
curl -X POST http://localhost:8000/dashboard/create-dashboard \
  -H "Content-Type: application/json" \
  -d '{"youtube_url": "https://www.youtube.com/watch?v=5EVhGtYa1B0"}'
```

### Test Library:

```bash
# Get all videos
curl http://localhost:8001/library

# Delete a video
curl -X DELETE http://localhost:8001/library/{video_id}
```

---

## 🐛 Troubleshooting

### "Dashboard creation failed"
- Check AssemblyAI API key has credits
- Verify YouTube video is accessible
- Check RAG API logs for errors

### "Sentiment data not loading"
- Ensure Supabase URL is correct (cikn... not c1kn...)
- Verify service_role key is set
- Check sentiment API is running on port 8001

### "Video not in library"
- Wait for dashboard creation to complete
- Check video_analyses table in Supabase
- Refresh the homepage

### "Chatbot not working"
- Verify OpenAI API key is set
- Check transcript was uploaded to Supabase
- Ensure RAG API is running on port 8000

---

## 📝 Notes

- First-time sentiment analysis downloads ML models (~500MB)
- Transcription costs ~$0.15 per hour of audio (AssemblyAI)
- Delete functionality removes ALL associated files
- Library updates automatically when new videos are added
- All original preset videos remain intact

---

## 🎓 Next Steps

Want to customize further?

1. **Change ticker detection**: Edit `guess_ticker_from_title()` in `create_dashboard_from_youtube.py`
2. **Add thumbnails**: Modify library card rendering in `page.tsx`
3. **Custom metadata**: Add fields to `metadata` jsonb column
4. **Email notifications**: Add webhook when job completes
5. **Batch processing**: Process multiple videos at once

---

## ✅ Summary

You now have a **fully automated** earnings call analysis platform that:
- ✨ Creates dashboards from any YouTube link
- 📊 Runs complete sentiment analysis
- 🤖 Integrates with AI chatbot
- 🗂️ Manages library dynamically
- 🗑️ Allows easy deletion
- 🚀 Works seamlessly end-to-end

**Everything is connected and ready to use!** 🎉

