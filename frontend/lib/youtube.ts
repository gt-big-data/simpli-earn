// Mirrors RAG/youtube_ids.py: dashboards are keyed by video ID, so the player must read a link the
// same way the API does. Both are tested against RAG/tests/youtube_url_cases.json.
const VIDEO_ID = /(?:[?&]v=|youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:live|embed|shorts|v)\/)([A-Za-z0-9_-]+)/;

/** Video ID from a watch, youtu.be, live, embed or shorts link; null if the link has none. */
export function extractVideoId(url: string | null | undefined): string | null {
  return url?.trim().match(VIDEO_ID)?.[1] ?? null;
}
