-- Cached LLM output for custom dashboards, generated once per video.
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Written and read by the RAG API: POST /summary stores {summary, sections, provider, generated_at}
-- in summary; POST /red-flags stores {flags, model, generated_at} in red_flags. Without these columns
-- /red-flags regenerates on every request and POST /summary cannot load the stored transcript.

ALTER TABLE public.video_analyses
    ADD COLUMN IF NOT EXISTS summary jsonb,
    ADD COLUMN IF NOT EXISTS red_flags jsonb;
