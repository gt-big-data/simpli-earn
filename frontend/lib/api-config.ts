const legacyApiUrl = process.env.NEXT_PUBLIC_API_URL;

// RAG service powers chat, summaries, and dashboard creation.
export const RAG_API_URL =
  process.env.NEXT_PUBLIC_RAG_API_URL ||
  legacyApiUrl ||
  "http://localhost:8000";

// Sentiment service powers library and sentiment graph endpoints.
export const SENTIMENT_API_URL =
  process.env.NEXT_PUBLIC_SENTIMENT_API_URL ||
  "http://localhost:8001";
