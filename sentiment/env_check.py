"""
Startup validation of the sentiment API's environment.

Problems are printed when the app starts. With STRICT_CONFIG=1 (set for Cloud Run in
cloudbuild.yaml) missing required settings stop startup instead.
"""

import os
from urllib.parse import urlparse


def check_environment(env=None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings) for the given environment mapping (default: os.environ)."""
    env = os.environ if env is None else env
    get = lambda name: (env.get(name) or "").strip()
    errors, warnings = [], []

    for name in ("SUPABASE_URL", "SUPABASE_KEY"):
        if not get(name):
            errors.append(f"Set {name} (every endpoint reads Supabase; use the service_role key)")
    url = urlparse(get("SUPABASE_URL"))
    if get("SUPABASE_URL") and (url.scheme not in ("http", "https") or not url.netloc):
        errors.append(f"SUPABASE_URL must be an http(s) URL, got {get('SUPABASE_URL')!r}")
    return errors, warnings


def validate_environment(service: str = "Sentiment API") -> None:
    errors, warnings = check_environment()
    for message in warnings:
        print(f"⚠️  [{service} config] {message}")
    for message in errors:
        print(f"❌ [{service} config] {message}")
    if errors and os.getenv("STRICT_CONFIG", "").strip().lower() in ("1", "true", "yes", "on"):
        raise RuntimeError(f"{service} configuration invalid (STRICT_CONFIG=1): " + "; ".join(errors))
