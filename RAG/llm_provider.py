"""
Centralized LLM provider with automatic OpenAI → Gemini fallback.

- Primary: OpenAI (gpt-4o)
- Fallback: Google Gemini (gemini-2.0-flash, free tier)
- Cooldown: after an OpenAI quota failure, skip OpenAI for N seconds
"""

import os
import time
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

OPENAI_COOLDOWN_SECONDS = int(os.getenv("OPENAI_COOLDOWN_SECONDS", "300"))

_openai_unavailable_since: float | None = None


def _openai_available() -> bool:
    global _openai_unavailable_since
    if not OPENAI_API_KEY:
        return False
    if _openai_unavailable_since is None:
        return True
    elapsed = time.time() - _openai_unavailable_since
    if elapsed > OPENAI_COOLDOWN_SECONDS:
        _openai_unavailable_since = None
        print(f"🔄 OpenAI cooldown expired after {OPENAI_COOLDOWN_SECONDS}s – retrying OpenAI")
        return True
    return False


def mark_openai_unavailable():
    global _openai_unavailable_since
    _openai_unavailable_since = time.time()
    print(
        f"⚠️  OpenAI marked unavailable for {OPENAI_COOLDOWN_SECONDS}s "
        f"– falling back to Gemini ({GEMINI_MODEL})"
    )


def is_quota_error(error: Exception) -> bool:
    err_str = str(error).lower()
    return any(
        k in err_str
        for k in ("insufficient_quota", "429", "quota", "rate_limit", "ratelimit")
    )


def get_active_provider() -> str:
    if _openai_available():
        return "openai"
    if GEMINI_API_KEY:
        return "gemini"
    return "none"


def get_llm(temperature: float = 0, streaming: bool = False):
    """Return the best available LangChain chat model (OpenAI preferred, Gemini fallback)."""

    if _openai_available():
        from langchain.chat_models import ChatOpenAI

        return ChatOpenAI(
            model_name=OPENAI_MODEL,
            openai_api_key=OPENAI_API_KEY,
            temperature=temperature,
            streaming=streaming,
        )

    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=GEMINI_API_KEY,
            temperature=temperature,
            convert_system_message_to_human=True,
        )

    raise RuntimeError(
        "No LLM provider available. "
        "Set OPENAI_API_KEY or GEMINI_API_KEY in RAG/.env"
    )


def run_with_fallback(primary_fn, rebuild_fn=None):
    """
    Execute *primary_fn*. On OpenAI quota errors, mark OpenAI unavailable,
    optionally call *rebuild_fn* (to reconstruct chains with the new provider),
    then retry *primary_fn* once.

    Returns the result of the successful call.
    Raises on non-quota errors or if both providers fail.
    """
    try:
        return primary_fn()
    except Exception as exc:
        if not is_quota_error(exc):
            raise

        if not GEMINI_API_KEY:
            raise RuntimeError(
                "OpenAI quota exceeded and no GEMINI_API_KEY configured. "
                "Add GEMINI_API_KEY to RAG/.env for automatic fallback."
            ) from exc

        mark_openai_unavailable()

        if rebuild_fn:
            rebuild_fn()

        return primary_fn()


# Startup diagnostics
def _print_status():
    providers = []
    if OPENAI_API_KEY:
        providers.append(f"OpenAI ({OPENAI_MODEL})")
    if GEMINI_API_KEY:
        providers.append(f"Gemini ({GEMINI_MODEL}) [fallback]")
    if providers:
        print(f"🤖 LLM providers: {', '.join(providers)}")
    else:
        print("❌ No LLM providers configured – set OPENAI_API_KEY or GEMINI_API_KEY")


_print_status()
