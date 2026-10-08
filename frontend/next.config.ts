import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Inlined into client code at build time; a production build without them talks to localhost.
const BUILD_TIME_PUBLIC_ENV = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SENTIMENT_API_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = BUILD_TIME_PUBLIC_ENV.filter((name) => !process.env[name]);
    // Build workers re-evaluate this file and inherit env, so warn once per build
    if (missing.length && !process.env.SIMPLIEARN_PUBLIC_ENV_WARNED) {
      process.env.SIMPLIEARN_PUBLIC_ENV_WARNED = "1";
      console.warn(
        `⚠️  Building without ${missing.join(", ")}: the bundle will use local development defaults. ` +
          "Set them at build time for a deployable build (see frontend/.env.example)."
      );
    }
  }
  return {};
}
