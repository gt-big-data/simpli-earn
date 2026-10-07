-- Record who added each custom dashboard so only they (or an admin) can delete it.
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Written by the RAG API's POST /dashboard/create-dashboard (signed-in users) via
-- scripts/create_dashboard_from_youtube.py and scripts/home_youtube_worker.py; checked by the
-- sentiment API's DELETE /library/{video_identifier}. Rows with NULL created_by (created before this
-- migration, or by signed-out users) can only be deleted by admins listed in
-- LIBRARY_ADMIN_USER_IDS / LIBRARY_ADMIN_EMAILS on the sentiment service.

ALTER TABLE public.video_analyses
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- Carries the requesting user through the home-worker queue (001_youtube_jobs.sql)
ALTER TABLE public.youtube_jobs
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
