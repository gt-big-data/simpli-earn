// API Configuration
// Uses environment variable for backend URL, falls back to localhost for development
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Sentiment service (FastAPI in `sentiment/`, default port 8001). */
export const SENTIMENT_API_BASE_URL =
  process.env.NEXT_PUBLIC_SENTIMENT_API_URL || 'http://localhost:8001';

