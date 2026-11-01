# Industry News setup

## Required manual setup

1. **Get a NewsAPI.ai API key** from your NewsAPI.ai account.
2. **Add `NEWSAPI_AI_KEY=your_key` to `frontend/.env.local` for local development.** Do not use a `NEXT_PUBLIC_` prefix. The API key must remain server-side.
3. **Add `NEWSAPI_AI_KEY` to the frontend application's production environment** (the same environment where the Next.js server runs), then redeploy/restart the frontend so the variable is available.
4. **Confirm the NewsAPI.ai plan permits your production use and expected volume.** This implementation caches responses in process memory for 15 minutes; separate server instances do not share that cache.

The variable is listed in `.env.example` as a reminder. Never put the real key in that tracked example file or commit it.

## What the integration does

- `GET /api/industry-news` verifies the current Supabase user, reads `profiles.sector_preferences`, and returns no stories when no sectors are selected.
- A server-side mapping turns the existing sector slugs into English search terms. A single NewsAPI.ai article search is made for the selected sectors, covering the most recent 18 days.
- The API response is normalized, limited to 12 relevant articles, deduplicated by URL, and restricted to HTTPS links. Stories are only tagged and displayed when the headline or both provider categories and concepts support a selected sector.
- Results are cached by the selected sector set for 15 minutes within a running server process. A provider failure can fall back to expired cached results when available.
- The dashboard widget renders loading, error/retry, no-preferences, no-results, and article-list states. Article links open the publisher's page in a new tab.

## Files

- `app/api/industry-news/route.ts` — authenticated provider route and sector mapping.
- `components/my-dashboard/IndustryNewsWidget.tsx` — dashboard presentation and fetch states.
- `.env.example` — placeholder for the server-only API key.

If you change the sectors in `lib/auth/constants.ts`, update the `SECTOR_TERMS` mapping in the API route to match.
