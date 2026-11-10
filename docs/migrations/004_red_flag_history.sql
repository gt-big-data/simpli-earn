-- Persistent red-flag predictive history (after-hours call → next trading open).
-- Run in Supabase SQL Editor (Dashboard → SQL → New query).
-- Written/read by RAG red_flag_prediction.py via POST /red-flags enrichment.
-- Without this table the API still works using the local seed JSON
-- (RAG/data/red_flag_hit_rates.json) as a fallback.

CREATE TABLE IF NOT EXISTS public.red_flag_call_outcomes (
    call_key text PRIMARY KEY,
    ticker text,
    earnings_date text,
    categories jsonb NOT NULL DEFAULT '[]'::jsonb,
    categories_source text,
    next_open_pct double precision,
    direction text,
    prior_close double precision,
    next_open double precision,
    next_open_date text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.red_flag_call_outcomes IS
  'Per-call next-open outcomes + red-flag categories for predictive hit-rates';

-- Service role (RAG API) needs full access; anon users do not write this table.
ALTER TABLE public.red_flag_call_outcomes ENABLE ROW LEVEL SECURITY;
