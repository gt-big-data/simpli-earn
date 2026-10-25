-- Private, append-only SimpliChat history. Run in Supabase SQL Editor before deploying chat.
BEGIN;

CREATE TABLE public.chat_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    dashboard_key text NOT NULL,
    dashboard_id text,
    video_identifier text,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (dashboard_id IS NOT NULL AND video_identifier IS NULL
         AND length(dashboard_id) BETWEEN 1 AND 200
         AND dashboard_key = 'preloaded:' || dashboard_id)
        OR
        (dashboard_id IS NULL AND video_identifier IS NOT NULL AND video_identifier ~ '^[A-Za-z0-9_-]{11}$'
         AND dashboard_key = 'youtube:' || video_identifier)
    )
);
CREATE INDEX chat_sessions_owner_dashboard_updated
    ON public.chat_sessions (user_id, dashboard_key, updated_at DESC, id);

CREATE TABLE public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL CHECK (length(btrim(content)) > 0),
    sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
    suggestions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suggestions) = 'array'),
    provider text,
    model text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, request_id, role),
    CHECK (role <> 'user' OR length(content) <= 2000)
);
CREATE INDEX chat_messages_session_created ON public.chat_messages (session_id, created_at, id);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_sessions, public.chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.chat_sessions TO authenticated;
GRANT INSERT (id, user_id, dashboard_key, dashboard_id, video_identifier, title)
    ON public.chat_sessions TO authenticated;
GRANT UPDATE (title, updated_at) ON public.chat_sessions TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT INSERT (id, session_id, request_id, role, content, sources, suggestions, provider, model)
    ON public.chat_messages TO authenticated;

CREATE POLICY chat_sessions_select ON public.chat_sessions FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
CREATE POLICY chat_sessions_insert ON public.chat_sessions FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY chat_sessions_update ON public.chat_sessions FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY chat_sessions_delete ON public.chat_sessions FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.chat_sessions s
                   WHERE s.id = chat_messages.session_id AND s.user_id = (SELECT auth.uid())));
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.chat_sessions s
                       WHERE s.id = chat_messages.session_id AND s.user_id = (SELECT auth.uid())));
-- No message UPDATE or DELETE policies/grants: deleting a session cascades its messages.

CREATE FUNCTION public.chat_session_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF (NEW.id, NEW.user_id, NEW.dashboard_key, NEW.dashboard_id, NEW.video_identifier, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.dashboard_key, OLD.dashboard_id, OLD.video_identifier, OLD.created_at) THEN
        RAISE EXCEPTION 'Chat ownership and transcript are immutable' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER chat_session_updated_at BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.chat_session_updated_at();

CREATE FUNCTION public.chat_message_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    -- Also locks the parent against deletion until this insert commits. Invoker RLS applies.
    UPDATE public.chat_sessions SET updated_at = clock_timestamp() WHERE id = NEW.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chat session not found' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'assistant' AND NOT EXISTS (
        SELECT 1 FROM public.chat_messages
        WHERE session_id = NEW.session_id AND request_id = NEW.request_id AND role = 'user'
    ) THEN
        RAISE EXCEPTION 'An assistant answer requires its user question' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER chat_message_parent BEFORE INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_message_parent();

REVOKE ALL ON FUNCTION public.chat_session_updated_at(), public.chat_message_parent()
    FROM PUBLIC, anon, authenticated;
-- These are trigger functions, not client-callable RPCs. Trigger invocation needs no EXECUTE grant.
COMMIT;
