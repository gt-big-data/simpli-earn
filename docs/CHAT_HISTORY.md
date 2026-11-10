# Persistent SimpliChat history

Signed-in users have multiple private conversations per transcript/dashboard. Guests keep an
in-memory conversation and see a sign-in prompt. Signing in does not import guest messages.
History survives reload/sign-out; signing out clears the visible messages and draft immediately.

## Database and configuration

1. Inspect the target project's existing grants/schema. Apply
   `docs/migrations/004_chat_history.sql` once in Supabase SQL Editor. It is transactional and
   creates only new chat objects. It does not require `video_analyses` or migrations 001–003.
2. Add `SUPABASE_ANON_KEY` to `RAG/.env`: use the same project's anon/publishable key used by the
   frontend. Keep `SUPABASE_KEY` as service-role for the existing public transcript operations.
   Strict startup validation rejects a missing anon key or one equal to the service-role key.
3. On Cloud Run, create/configure Secret Manager secret `supabase-anon-key` and grant the service
   account access. `cloudbuild.yaml` attaches it as `SUPABASE_ANON_KEY`. No new frontend variables.
4. Deploy the backend before the frontend. A saved answer is successful only when `/chat`
   acknowledges both saved message IDs, or says `saved: false` explicitly. An old backend produces
   an explicit error, never a false saved answer. Roll back application revisions without dropping the chat tables.

Browser session CRUD/reads use the existing Supabase client and its user JWT. Backend chat
writes use a request-scoped client with the public key, the verified bearer token, no local auth
session/refresh, and an owned/closed HTTP transport. They never use the global service-role client.
RLS checks session ownership and message-parent ownership; messages have no update/delete grants.
Deleting a session or account cascades its messages. No retention, pruning, or backfill is added.
The history list is ordered by `updated_at`, which only a new message advances (the
message-insert trigger's nested update): any direct client UPDATE, whether a rename, an unchanged
title or an explicit `updated_at`, keeps the chat where it is. Messages get `created_at =
clock_timestamp()`, so a question and answer saved in one transaction keep their order.

Stored text is capped by CHECK constraints: titles 1–100 characters, questions 2,000, answers
50,000, `sources` 64 KiB and `suggestions` 16 KiB of JSON, and no title or message may be blank.
Measured against real data (2026-10-26): the largest possible `sources` over every bundled
transcript is 2.3 KB (4 chunks of at most 500 characters), suggestions about 200 bytes, and
answers deliberately pushed to be long about 1,000 characters.

Keys are `preloaded:<dashboard ID>` for bundled transcripts and `youtube:<video ID>` for custom
videos. URL variants normalize to the same custom key. These namespaces deliberately stay
separate because they can load different transcript text. Transcript identity/ownership are
immutable. Public analysis deletion does not delete private history.

## Chat contract and recovery

Guest `/chat` requests keep `{message, id, video_url, history}`. Saved requests add UUID
`session_id` and `request_id` plus `Authorization: Bearer <user access token>`. Both IDs are
required together; invalid auth is rejected rather than falling back to guest mode. An
inaccessible session is 404; mismatched transcript or reusing a request ID for different text
is 409. Full answers, original sources `{chunk,source,text}`, suggestions and the actual answer
provider/model are stored. The greeting and UI error/status text are not stored.

New Chat is a browser-only draft until its first send. The browser picks the new chat's UUID
and sends it as `session_id` with `title` (the first question, at most 100 characters); `/chat`
then creates the chat and its first question in one transaction (`chat_start` in migration 004,
run under the caller's JWT). A send that fails before the question saves (backend unreachable,
bad token, unknown transcript) therefore leaves no chat behind. Retries reuse both IDs, so a
lost response never creates a second chat; another user's chat ID returns 404. `title` without
an existing or new chat, or on a guest request, is 422. The list shows the new chat while its
first send is pending, and drops it again if that send created nothing.

The backend saves the question, generates the complete JSON answer, then saves the assistant
row before HTTP 200. Success adds `session_id`, `request_id`, `user_message_id`,
`assistant_message_id` and `saved: true` to the response. A duplicate request returns the
previously saved answer. A question that breaks a CHECK (blank, too long) is a 422 and never
reaches the model. An answer that breaks a storage cap is still returned, as HTTP 200 with
`saved: false`, `not_saved_reason` and no `assistant_message_id`: the browser shows it marked
unsaved, and after a reload its question shows "No saved answer yet" with Retry. Concurrent retries may duplicate inference work but save only one question/answer pair.

The controller belongs to the dashboard, so panel close/fullscreen does not cancel generation.
Browser disconnection can still allow the backend to finish saving. Process termination,
database outage or JWT expiration during generation can leave an unanswered question. Refresh
looks for an answer; Retry reuses the request ID and original text. There is no durable job queue
or streaming. Owner JWTs authorize their own message inserts, so history is not an audited proof
that each answer came from the model.

All stored messages load through stable paginated reads. Only the latest 20 completed pairs
are sent back into inference, clipped to 2,000/8,000 Unicode characters per question/answer.
JSON UTF-8 size is checked against 1 MiB, dropping oldest context pairs as necessary. Full stored
and displayed text is not clipped. `CHAT_MAX_TURNS` can lower the backend context window; if
`MAX_REQUEST_BODY_BYTES` is lowered below the default, the browser may receive a 413.

## All chats across dashboards

The fullscreen history (sidebar, or the History popover below `lg`) has two tabs: this
dashboard's chats (labelled with its ticker, e.g. "AAPL chats") and "All chats", which lists the
account's chats on every dashboard with a ticker tag on each. All chats reads `chat_sessions`
without the `dashboard_key` filter (RLS still limits it to the user's rows) and merges this
dashboard's live list into it, so a new message moves its chat at once; other dashboards' chats
update on refresh, window focus or reopening the tab.

A chat is bound to its transcript: every `/chat` request carries the dashboard's transcript and
history for that transcript only. So opening another dashboard's chat from All chats is a route
change, never an in-place load: the page navigates to that dashboard with `?chat=<session id>`
added (`/dashboard?id=…` or `?video_url=…&ticker=…`), and that chat opens first. A `?chat=` the
dashboard doesn't list (deleted, or another dashboard's) falls back to its newest chat. Opening
a `?chat=` link, including on a fresh page load, also opens the SimpliChat panel.

The dashboard page stays mounted across that navigation, so fullscreen, the selected tab, and the
search query, ticker filters and sort survive it. A new controller is created for the new
transcript, so the unsent message box text is lost, the list reloads (briefly showing "Loading
history…") and its scroll position resets. An answer still generating on the old dashboard is
not shown, but the backend still saves it. Search, filters and sort reset on a page reload.

Ticker tags come from `frontend/lib/dashboards.ts`: preloaded dashboards use its
`PRELOADED_DASHBOARDS` map (shared with the charts), custom calls use the library's
`metadata.ticker`, and a ticker from the URL wins for the current dashboard. Tickers are trimmed
and upper-cased; blank or `N/A` counts as unknown. A chat with no ticker is tagged "Video" (a
custom YouTube call) or "Other", never blank. The landing page's `public/data/mock-calls.json`
is a separate ticker source and is not merged in; keep it in step by hand when adding a
preloaded dashboard. A test fails if a dashboard in `preloaded_videos.json` has no ticker.

Limitations:

- Search (Fuse.js, in the browser) covers chat titles or tickers only, not message text; the list
  doesn't load messages, and searching them would need a query per chat.
- All chats reads every chat in pages of 200, with no cap or "load more". Fine at current volume;
  a very large history loads in full before it can be searched.
- Switching to All chats re-reads the list each time (the previous list stays on screen meanwhile).
- The list query embeds `chat_messages(count)` so chats can be sorted by length; it uses the
  existing SELECT grants and RLS, with no schema change.

## Local verification

Run Next.js on 3000, RAG on 8000, with the same dev Supabase project/key configuration. Bundled
dashboard `http://localhost:3000/dashboard?id=1` avoids needing the YouTube/sentiment pipeline.
The deployment blocker does not block this local path.

```sh
venv/bin/python -m pip install -r RAG/requirements-dev.txt
venv/bin/python -m pytest RAG/tests -q
cd frontend
npm test
npm run lint
npm run build
```

## Try chat history in the browser with local Supabase

The standalone PostgreSQL commands in the next section test SQL/RLS only. Browser chat also
needs Supabase Auth and PostgREST. Use a separate local Supabase stack for this walkthrough;
there is no need to apply the migration to hosted Supabase.

1. Install and start a Docker-compatible container runtime, such as Docker Desktop. Node.js
   20+ is required for the CLI through `npx`. The first start downloads the local service images.
   See the [official local development guide](https://supabase.com/docs/guides/local-development/cli/getting-started).
2. From the repository root, initialize a separate local project outside the checkout:

   ```sh
   supabase_chat_dir="$(mktemp -d /tmp/simpli-supabase.XXXXXX)"
   npx --yes supabase init --workdir "$supabase_chat_dir"
   npx --yes supabase start --workdir "$supabase_chat_dir"
   npx --yes supabase status --workdir "$supabase_chat_dir" -o env
   ```

   Keep this directory path for subsequent status/stop commands. These commands do not link a
   hosted project. If your standalone PostgreSQL test server is still running, stop it in its
   original terminal with `pg_ctl -D "$chat_test_dir/data" stop`; it is separate from this stack.
3. Apply the existing account-profile schema and new chat schema to the **local Supabase DB**.
   With the default ports, run from the repository root:

   ```sh
   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
     -v ON_ERROR_STOP=1 \
     -f docs/supabase_profiles_migration.sql \
     -f docs/migrations/004_chat_history.sql
   ```

   If status reports a different DB URL, use that local URL instead. Do not run
   `tests/chat_history_bootstrap.sql` here: Supabase already supplies the real auth schema/roles.
   Migration 004 should be applied once to this fresh local database.
4. Update only the relevant settings in your existing ignored env files, keeping your LLM keys:

   ```dotenv
   # RAG/.env
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<local ANON_KEY from status>
   SUPABASE_KEY=<local SERVICE_ROLE_KEY from status>
   ```

   ```dotenv
   # frontend/.env.local
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<same local ANON_KEY>
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

   Use the API URL reported by status if it differs. If testing account deletion too, set
   frontend server-only `SUPABASE_SERVICE_ROLE_KEY` to the local service-role key. Restore your
   original settings when returning to the hosted project.
5. Start the services in separate terminals from the repository root (restart any old processes
   so they load the new env values):

   ```sh
   # Terminal A
   cd RAG
   ../venv/bin/python -m uvicorn api_chatbot:app --reload --port 8000
   ```

   ```sh
   # Terminal B
   cd frontend
   npm run dev -- --webpack
   ```

   Register at `http://localhost:3000/signup` using email/password and complete onboarding.
   If email confirmation is requested, use the local mail inbox URL reported by the CLI.
   Local test accounts are separate from hosted accounts; Google OAuth is not needed.
   Open `http://localhost:3000/dashboard?id=1`, open SimpliChat, send a question, reload, and
   reopen chat. Verify New Chat, switching, rename/delete and sign-out/sign-in. Use another
   browser profile/incognito window with a second local account to check isolation.

Bundled transcript chat needs a working OpenAI or Gemini key, but does not require ingesting
a video or copying the hosted `video_analyses` table. Sentiment/chart features are outside this
focused walkthrough. When finished, stop the local stack with:

```sh
npx --yes supabase stop --workdir "$supabase_chat_dir"
```

## PostgreSQL-only RLS tests

For real PostgreSQL policy tests without Docker/Supabase, use an empty disposable PostgreSQL
cluster. You need `initdb`, `pg_ctl`, and `psql` on your PATH (already installed on the current
development Mac). Run the complete block from the repository root, in the same terminal:

```sh
chat_test_dir="$(mktemp -d /tmp/simpli-chat.XXXXXX)"
initdb -D "$chat_test_dir/data" -A trust -U chat_test --no-locale --encoding=UTF8

# Only a private local Unix socket; no TCP listener or hosted database connection.
pg_ctl -D "$chat_test_dir/data" -l "$chat_test_dir/postgres.log" \
  -o "-F -p 55438 -k $chat_test_dir -c listen_addresses=''" start

psql -h "$chat_test_dir" -p 55438 -U chat_test -d postgres \
  -v ON_ERROR_STOP=1 \
  -f tests/chat_history_bootstrap.sql \
  -f docs/migrations/004_chat_history.sql \
  -f tests/chat_history_rls.sql

# Stop the test server, including if the assertions failed.
pg_ctl -D "$chat_test_dir/data" stop
```

Success ends with `PASS: PostgreSQL chat RLS, grants, constraints, idempotency, metadata,
triggers, and cascades`. A bare `psql` command instead tries your default connection, usually
`/tmp/.s.PGSQL.5432`; "No such file or directory" means no server is listening there. Use the
explicit host, port, user and database above. For another run, start with a fresh temporary
directory; the migration creates its objects once.

Bootstrap is **only for an empty disposable PostgreSQL database**. It supplies minimal Supabase
roles and `auth.uid()` claim semantics, not a mock of RLS. The assertions execute the real
policies, constraints, invoker triggers and cascades as `authenticated` and `anon`, then roll
back all fixtures. This does not verify Supabase Auth/PostgREST integration.

For full Supabase REST integration, apply migration 004 to a local or disposable Supabase
project. Set `CHAT_TEST_SUPABASE_URL`, `CHAT_TEST_SUPABASE_ANON_KEY` and
`CHAT_TEST_SUPABASE_SERVICE_ROLE_KEY` in the test process without committing them, then run:

```sh
venv/bin/python tests/check_chat_rls.py
```

This explicitly creates two temporary Auth users, signs them in, and checks direct REST
allow/deny behavior using their JWTs and the public key. The service role is used only for
fixture lifecycle and observing account-deletion cascades. Both users are deleted on cleanup.
Missing configuration is an error, not a skipped/passing test. Never run against production.

Manual checks with two separate browser sessions:

- Send a question, close/reopen chat and toggle fullscreen; answers and suggestions remain.
- Reload during generation, then refresh to recover the backend-saved answer.
- Sign out/in as the same user; saved chats return. Switch accounts; no previous messages or
  draft appear. Guests stay temporary and are not imported on login.
- Create two chats on the same call, switch, rename, and delete the active chat. Verify the
  list in fullscreen and through the docked/mobile History control.
- Stop the API or interrupt generation; verify Retry and no false saved success. Verify a late
  response never appears in a different selected thread/account.
- Verify >20 saved pairs remain readable while only bounded recent context reaches `/chat`.
- With chats on two dashboards, open one of the other dashboard's from All chats in fullscreen:
  the URL gains `?chat=`, that chat opens, and the tab, search, filters and sort are unchanged.

Repeat the two-account smoke test on the hosted build after the backend deployment blocker is
resolved. Do not claim the hosted path or Supabase REST suite passed based on local SQL/unit tests.
