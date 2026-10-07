-- Cached LLM output for custom dashboards, generated once per video.
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Written and read by the RAG API: POST /summary stores {summary, sections, provider, generated_at}
-- in summary; POST /red-flags stores {flags, model, generated_at} in red_flags. Optional: without these
-- columns both endpoints still work and regenerate their output on every request instead of caching it.

ALTER TABLE public.video_analyses
    ADD COLUMN IF NOT EXISTS summary jsonb,
    ADD COLUMN IF NOT EXISTS red_flags jsonb;
