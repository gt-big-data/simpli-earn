-- Carries the ownership check made when a dashboard job is queued to the home worker, so the
-- pipeline's final write can enforce it atomically (see scripts/create_dashboard_from_youtube.py,
-- --expect-owner). Values: 'new' (insert only), 'none' (row must be ownerless) or the owner's user id.
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query) after 001 and 004.
-- Without it, queued jobs can only create new dashboards (reprocessing via the worker fails safe).

ALTER TABLE public.youtube_jobs
    ADD COLUMN IF NOT EXISTS expected_owner text;
