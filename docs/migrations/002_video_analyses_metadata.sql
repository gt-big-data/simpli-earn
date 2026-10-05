-- Video metadata for custom (pasted-link) dashboards: {title, ticker, upload_date}.
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Written by scripts/create_dashboard_from_youtube.py; read by the RAG API's GET /video-info
-- (stock + market indicator charts) and the sentiment API's GET /library (landing page cards).
-- Rows without it still work: /video-info falls back to the transcript filename and yt-dlp.

ALTER TABLE public.video_analyses
    ADD COLUMN IF NOT EXISTS metadata jsonb;
