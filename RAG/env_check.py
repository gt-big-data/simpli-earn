"""
Startup validation of the RAG API's environment.

Problems are printed when the app starts. With STRICT_CONFIG=1 (set for Cloud Run in
cloudbuild.yaml) missing required settings stop startup instead, so a misconfigured revision
never receives traffic.
"""

import os
from urllib.parse import urlparse


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def check_environment(env=None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings) for the given environment mapping (default: os.environ)."""
    env = os.environ if env is None else env
    get = lambda name: (env.get(name) or "").strip()
    errors, warnings = [], []

    if not get("OPENAI_API_KEY") and not get("GEMINI_API_KEY"):
        errors.append("Set OPENAI_API_KEY or GEMINI_API_KEY (chat, summaries, compare, red flags, embeddings)")

    embedding_provider = get("EMBEDDING_PROVIDER").lower()
    if embedding_provider not in ("", "openai", "gemini"):
        errors.append(f"EMBEDDING_PROVIDER must be openai, gemini or empty, not {embedding_provider!r}")
    elif embedding_provider and not get(f"{embedding_provider.upper()}_API_KEY"):
        errors.append(f"EMBEDDING_PROVIDER={embedding_provider} requires {embedding_provider.upper()}_API_KEY")

    for name in ("SUPABASE_URL", "SUPABASE_KEY"):
        if not get(name):
            errors.append(f"Set {name} (custom dashboards, transcripts, summaries and red flags use Supabase)")
    if get("SUPABASE_URL") and not _is_http_url(get("SUPABASE_URL")):
        errors.append(f"SUPABASE_URL must be an http(s) URL, got {get('SUPABASE_URL')!r}")

    home_worker = get("YOUTUBE_HOME_WORKER").lower() in ("1", "true", "yes", "on")
    if not home_worker and not get("ASSEMBLYAI_KEY"):
        warnings.append(
            "ASSEMBLYAI_KEY is not set: dashboard creation runs in this service (YOUTUBE_HOME_WORKER=0) and "
            "will fail unless the key is in sentiment/.env"
        )
    return errors, warnings


def validate_environment(service: str = "RAG API") -> None:
    errors, warnings = check_environment()
    for message in warnings:
        print(f"⚠️  [{service} config] {message}")
    for message in errors:
        print(f"❌ [{service} config] {message}")
    if errors and os.getenv("STRICT_CONFIG", "").strip().lower() in ("1", "true", "yes", "on"):
        raise RuntimeError(f"{service} configuration invalid (STRICT_CONFIG=1): " + "; ".join(errors))
