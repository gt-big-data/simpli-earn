// Runs once when the Next.js server starts: flag server-only configuration that is missing.
// (NEXT_PUBLIC_* values are checked at build time in next.config.ts.)
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "⚠️  SUPABASE_SERVICE_ROLE_KEY is not set: /api/auth/delete-account will return 500 until it is configured."
    );
  }
}
