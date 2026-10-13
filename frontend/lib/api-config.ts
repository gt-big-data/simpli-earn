// API Configuration
// NEXT_PUBLIC_* values are inlined into the bundle by `next build`, so they must be set when the
// app is built (Docker build args in frontend/Dockerfile; Vercel project env), not only at runtime.
// The localhost fallbacks are for local development.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Sentiment service (FastAPI in `sentiment/`, default port 8001). */
export const SENTIMENT_API_BASE_URL =
  process.env.NEXT_PUBLIC_SENTIMENT_API_URL || 'http://localhost:8001';
