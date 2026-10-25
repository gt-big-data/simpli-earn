-- Run as a database owner against a DISPOSABLE database after migration 004.
-- Uses real PostgreSQL roles/RLS, with the same auth.uid() claim semantics as Supabase.
-- All fixtures/functions below are rolled back. See docs/CHAT_HISTORY.md.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.denied(query text, expected text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'FAILED: expected rejection for %', query;
END;
$$;
SELECT format('GRANT USAGE ON SCHEMA %I TO authenticated, anon', nspname)
    FROM pg_namespace WHERE oid = pg_my_temp_schema() \gexec
INSERT INTO auth.users (id) VALUES
 ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
INSERT INTO public.chat_sessions (id, dashboard_key, dashboard_id, title) VALUES
 ('20000000-0000-0000-0000-000000000001', 'preloaded:1', '1', 'Alice');
SELECT pg_temp.assert_true((SELECT user_id = auth.uid() FROM public.chat_sessions), 'default owner');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (user_id,dashboard_key,dashboard_id,title)
 VALUES ('10000000-0000-0000-0000-000000000002','preloaded:1','1','spoof')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,title) VALUES ('invalid','missing locator')$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title)
 VALUES ('youtube:5EVhGtYa1B0','1','wrong key')$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title,created_at)
 VALUES ('preloaded:1','1','spoof time',now())$q$);
SELECT pg_temp.denied($q$UPDATE public.chat_sessions SET user_id='10000000-0000-0000-0000-000000000002'$q$);
SELECT pg_temp.denied($q$UPDATE public.chat_sessions SET dashboard_id='2',dashboard_key='preloaded:2'$q$);

SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content)
 VALUES ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','assistant','orphan')$q$, '23514');
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','user','Revenue?');
INSERT INTO public.chat_messages (session_id,request_id,role,content,sources,suggestions,provider,model) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','assistant','Full answer',
 '[{"chunk":1,"source":"t.txt","text":"Revenue grew"}]','["Margins?"]','gemini','test-model');
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','assistant','must not replace')
 ON CONFLICT (session_id,request_id,role) DO NOTHING;
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.chat_messages), 'idempotent pair');
SELECT pg_temp.assert_true((SELECT content = 'Full answer' AND sources->0->>'text' = 'Revenue grew'
 FROM public.chat_messages WHERE role='assistant'), 'content and metadata preserved');
SELECT pg_temp.assert_true((SELECT updated_at >= created_at FROM public.chat_sessions), 'invoker timestamp trigger');
SELECT pg_temp.denied($q$UPDATE public.chat_messages SET content='tampered'$q$);
SELECT pg_temp.denied($q$DELETE FROM public.chat_messages$q$);
SELECT updated_at AS before_rename FROM public.chat_sessions \gset
UPDATE public.chat_sessions SET title='Renamed', updated_at='1900-01-01';
SELECT pg_temp.assert_true((SELECT title='Renamed' AND updated_at = :'before_rename' FROM public.chat_sessions),
 'rename keeps list position and ignores client time');
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','user','Next question');
SELECT pg_temp.assert_true((SELECT updated_at > :'before_rename' FROM public.chat_sessions), 'message insert still bumps');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_sessions), 'unfiltered sessions isolated');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_messages), 'unfiltered messages isolated');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000001'), 'ID lookup isolated');
UPDATE public.chat_sessions SET title='Bob attack' WHERE id='20000000-0000-0000-0000-000000000001';
DELETE FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content)
 VALUES ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','user','attack')$q$);
INSERT INTO public.chat_sessions (id,dashboard_key,video_identifier,title) VALUES
 ('20000000-0000-0000-0000-000000000002','youtube:5EVhGtYa1B0','5EVhGtYa1B0','Bob');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.chat_sessions), 'Bob owns only Bob');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '';
SELECT pg_temp.denied('SELECT * FROM public.chat_sessions');
SELECT pg_temp.denied('SELECT * FROM public.chat_messages');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title) VALUES ('preloaded:1','1','anon')$q$);
SELECT pg_temp.denied($q$UPDATE public.chat_sessions SET title='anon'$q$);
SELECT pg_temp.denied('DELETE FROM public.chat_sessions');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content)
 VALUES ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','user','anon')$q$);
SELECT pg_temp.denied($q$UPDATE public.chat_messages SET content='anon'$q$);
SELECT pg_temp.denied('DELETE FROM public.chat_messages');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT title='Renamed' FROM public.chat_sessions), 'cross-user mutations changed nothing');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.chat_messages), 'cross-user inserts changed nothing');
DELETE FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_messages), 'session cascade without message DELETE grant');
INSERT INTO public.chat_sessions (id,dashboard_key,dashboard_id,title) VALUES
 ('20000000-0000-0000-0000-000000000003','preloaded:2','2','Account cascade');
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','user','delete account');
RESET ROLE;
DELETE FROM auth.users WHERE id='10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM public.chat_sessions WHERE user_id='10000000-0000-0000-0000-000000000001'), 'account session cascade');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM public.chat_messages WHERE session_id='20000000-0000-0000-0000-000000000003'), 'account message cascade');
ROLLBACK;
\echo 'PASS: PostgreSQL chat RLS, grants, constraints, idempotency, metadata, triggers, and cascades'
