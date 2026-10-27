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
-- Runs a statement that must succeed, then undoes it (for boundary values)
CREATE FUNCTION pg_temp.accepted(query text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE query;
        RAISE EXCEPTION 'undo' USING ERRCODE = 'P0099';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN RETURN;
    END;
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
UPDATE public.chat_sessions SET title='Renamed';
SELECT pg_temp.assert_true((SELECT updated_at = :'before_rename' FROM public.chat_sessions), 'same-title update keeps list position');
UPDATE public.chat_sessions SET updated_at=clock_timestamp() + interval '1 day';
SELECT pg_temp.assert_true((SELECT updated_at = :'before_rename' FROM public.chat_sessions), 'direct updated_at update keeps list position');
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','user','Next question');
SELECT pg_temp.assert_true((SELECT updated_at > :'before_rename' FROM public.chat_sessions), 'message insert still bumps');
-- One transaction (this whole suite is one): created_at = now() would tie, and the assistant's
-- smaller id would then sort it first; clock_timestamp() keeps the question first.
INSERT INTO public.chat_messages (id,session_id,request_id,role,content) VALUES
 ('ffffffff-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000008','user','Ordered question');
INSERT INTO public.chat_messages (id,session_id,request_id,role,content) VALUES
 ('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000008','assistant','Ordered answer');
SELECT pg_temp.assert_true((SELECT array_agg(role ORDER BY created_at, id) FROM public.chat_messages
 WHERE request_id='30000000-0000-0000-0000-000000000008') = ARRAY['user','assistant'], 'question then answer sort question-first');
-- Blank text and size caps (23514). An answer's question exists first, so only the cap can reject it.
INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','user','Caps question');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','user',E' \t\n ')$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title) VALUES ('preloaded:1','1',E' \t ')$q$, '23514');
SELECT pg_temp.denied($q$UPDATE public.chat_sessions SET title='   '$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title) VALUES ('preloaded:1','1',repeat('t',101))$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','user',repeat('q',2001))$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','assistant',repeat('a',50001))$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content,sources) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','assistant','ok',
  jsonb_build_array(repeat('s',65533)))$q$, '23514');
SELECT pg_temp.denied($q$INSERT INTO public.chat_messages (session_id,request_id,role,content,suggestions) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','assistant','ok',
  jsonb_build_array(repeat('s',16381)))$q$, '23514');
-- Exactly at each cap is accepted (["…"] adds 4 octets)
SELECT pg_temp.accepted($q$INSERT INTO public.chat_messages (session_id,request_id,role,content,sources,suggestions) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','assistant',repeat('a',50000),
  jsonb_build_array(repeat('s',65532)), jsonb_build_array(repeat('s',16380)))$q$);
SELECT pg_temp.accepted($q$INSERT INTO public.chat_sessions (dashboard_key,dashboard_id,title) VALUES ('preloaded:1','1',repeat('t',100))$q$);

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
SELECT pg_temp.denied($q$SELECT public.chat_start('20000000-0000-0000-0000-000000000009','preloaded:1','1',NULL,'anon',
 '30000000-0000-0000-0000-000000000009','anon')$q$);
SELECT pg_temp.denied('DELETE FROM public.chat_messages');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT title='Renamed' FROM public.chat_sessions), 'cross-user mutations changed nothing');
SELECT pg_temp.assert_true((SELECT count(*)=6 FROM public.chat_messages), 'cross-user inserts changed nothing');
DELETE FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_messages), 'session cascade without message DELETE grant');
SELECT public.chat_start('20000000-0000-0000-0000-000000000004','preloaded:1','1',NULL,'Started',
 '30000000-0000-0000-0000-000000000005','First question');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.chat_sessions
 WHERE id='20000000-0000-0000-0000-000000000004' AND title='Started' AND user_id=auth.uid())
 AND (SELECT count(*)=1 FROM public.chat_messages WHERE session_id='20000000-0000-0000-0000-000000000004' AND role='user'),
 'chat_start creates the chat with its question');
SELECT pg_temp.assert_true((SELECT updated_at > created_at FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000004'),
 'chat_start bumps the chat through the message trigger');
SELECT pg_temp.denied($q$SELECT public.chat_start('20000000-0000-0000-0000-000000000005','preloaded:1','1',NULL,'Empty',
 '30000000-0000-0000-0000-000000000006',' ')$q$, '23514');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000005'),
 'chat_start is all-or-nothing');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SELECT pg_temp.denied($q$SELECT public.chat_start('20000000-0000-0000-0000-000000000004','preloaded:1','1',NULL,'Bob claims',
 '30000000-0000-0000-0000-000000000007','Mine?')$q$, '23505');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT title='Started' FROM public.chat_sessions WHERE id='20000000-0000-0000-0000-000000000004')
 AND (SELECT count(*)=1 FROM public.chat_messages WHERE session_id='20000000-0000-0000-0000-000000000004'),
 'another user cannot take a chat ID');
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
