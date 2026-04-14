-- Queue for YouTube dashboard jobs when Cloud Run must NOT call yt-dlp (429 mitigation).
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- The RAG API and home worker use the service_role key, which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.youtube_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url text NOT NULL,
    ticker text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    video_id text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_youtube_jobs_status_created
    ON public.youtube_jobs (status, created_at);

ALTER TABLE public.youtube_jobs ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated cannot read/write via PostgREST.
-- Service role (used by RAG + worker) bypasses RLS.

COMMENT ON TABLE public.youtube_jobs IS 'YouTube ingest queue; processed by home worker when YOUTUBE_HOME_WORKER=1 on API.';
