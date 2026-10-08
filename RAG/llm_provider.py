"""
Centralized LLM and embedding providers with automatic OpenAI → Gemini fallback.

- Primary: OpenAI (gpt-4o, text-embedding-ada-002)
- Fallback: Google Gemini (gemini-3.1-flash-lite, gemini-embedding-001)
- Cooldown: after an OpenAI quota failure, skip OpenAI for N seconds
- Either key alone is enough; with only GEMINI_API_KEY nothing calls OpenAI.
"""

import json
import os
import re
import time
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

OPENAI_COOLDOWN_SECONDS = int(os.getenv("OPENAI_COOLDOWN_SECONDS", "300"))

# Embeddings follow the chat provider unless pinned with EMBEDDING_PROVIDER=openai|gemini.
# Vectors from different models are not comparable, so FAISS indexes are stored per
# provider+model (see embedding_namespace) and are never queried with another model.
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "").strip().lower()
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

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
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=OPENAI_MODEL,
            api_key=OPENAI_API_KEY,
            temperature=temperature,
            streaming=streaming,
        )

    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI

        # System messages are sent as Gemini system instructions natively
        return ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=GEMINI_API_KEY,
            temperature=temperature,
        )

    raise RuntimeError(
        "No LLM provider available. "
        "Set OPENAI_API_KEY or GEMINI_API_KEY in RAG/.env"
    )


def get_model_name() -> str | None:
    """Chat model that get_llm() would return right now."""
    provider = get_active_provider()
    return {"openai": OPENAI_MODEL, "gemini": GEMINI_MODEL}.get(provider)


def get_embedding_provider() -> str:
    if EMBEDDING_PROVIDER == "openai":
        return "openai" if OPENAI_API_KEY else "none"
    if EMBEDDING_PROVIDER == "gemini":
        return "gemini" if GEMINI_API_KEY else "none"
    return get_active_provider()


def embedding_namespace(provider: str | None = None) -> str:
    """Directory-safe id of the embedding provider+model, used to keep FAISS indexes apart."""
    provider = provider or get_embedding_provider()
    model = {"openai": OPENAI_EMBEDDING_MODEL, "gemini": GEMINI_EMBEDDING_MODEL}.get(provider, "")
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", f"{provider}-{model}")


def get_embeddings():
    """Return (embeddings, namespace) for the best available provider."""
    provider = get_embedding_provider()

    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL, api_key=OPENAI_API_KEY), embedding_namespace(provider)

    if provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        return (
            GoogleGenerativeAIEmbeddings(model=GEMINI_EMBEDDING_MODEL, google_api_key=GEMINI_API_KEY),
            embedding_namespace(provider),
        )

    if EMBEDDING_PROVIDER in ("openai", "gemini"):
        raise RuntimeError(
            f"EMBEDDING_PROVIDER={EMBEDDING_PROVIDER} but its API key is not set in RAG/.env"
        )
    raise RuntimeError(
        "No embedding provider available. "
        "Set OPENAI_API_KEY or GEMINI_API_KEY in RAG/.env"
    )


def get_json_llm(temperature: float = 0):
    """Chat model constrained to emit a single JSON object, on whichever provider is active."""
    if _openai_available():
        return get_llm(temperature=temperature).bind(response_format={"type": "json_object"})

    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=GEMINI_API_KEY,
            temperature=temperature,
            response_mime_type="application/json",
        )

    return get_llm(temperature=temperature)  # raises the "no provider" error


def parse_json_object(raw: str) -> dict:
    """Parse a model's JSON reply, tolerating Markdown fences or text around the object."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object, got {type(value).__name__}")
    return value


def invoke_json(messages, temperature: float = 0) -> dict:
    """Send chat messages and return the parsed JSON object, falling back to Gemini on OpenAI quota errors."""
    from langchain_core.output_parsers import StrOutputParser

    return run_with_fallback(
        lambda: parse_json_object((get_json_llm(temperature) | StrOutputParser()).invoke(messages))
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
        print(f"🧭 Embeddings: {embedding_namespace()}")
    else:
        print("❌ No LLM providers configured – set OPENAI_API_KEY or GEMINI_API_KEY")


_print_status()
