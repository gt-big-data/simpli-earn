-- Per-user Industry News snapshots (one user -> many digests). Run in Supabase SQL Editor before
-- deploying the frontend change that reads it.
-- Written and read by frontend/app/api/industry-news/route.ts as the signed-in user. A new digest is
-- fetched from NewsAPI.ai only when the user has none for their current sectors, or when they have
-- signed in since the latest one and it is at least 24 hours old; otherwise the latest is reused.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_news_digests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Query version plus the sorted sector slugs, so a changed query or sector selection gets its own digest
    sector_key text NOT NULL CHECK (length(sector_key) BETWEEN 1 AND 500),
    sectors text[] NOT NULL,
    articles jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(articles) = 'array' AND octet_length(articles::text) <= 262144),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_news_digests_owner_key_created
    ON public.user_news_digests (user_id, sector_key, created_at DESC);
CREATE INDEX IF NOT EXISTS user_news_digests_owner_created
    ON public.user_news_digests (user_id, created_at DESC);

ALTER TABLE public.user_news_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_news_digests FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.user_news_digests TO authenticated;
GRANT INSERT (user_id, sector_key, sectors, articles) ON public.user_news_digests TO authenticated;

DROP POLICY IF EXISTS user_news_digests_select ON public.user_news_digests;
DROP POLICY IF EXISTS user_news_digests_insert ON public.user_news_digests;
DROP POLICY IF EXISTS user_news_digests_delete ON public.user_news_digests;
CREATE POLICY user_news_digests_select ON public.user_news_digests FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_news_digests_insert ON public.user_news_digests FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_news_digests_delete ON public.user_news_digests FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

COMMIT;
