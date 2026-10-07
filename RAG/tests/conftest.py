import os
import sys
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAG_DIR))

# Tests never talk to real providers or Supabase; keep any local RAG/.env out of the picture.
for name in ("OPENAI_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"):
    os.environ[name] = ""
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import json

import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

COMPARE_JSON = {
    "sentiment_current": 7,
    "sentiment_previous": 5,
    "narrative_shifts": ["a", "b", "c"],
    "current_label": "Apple Q4 2024",
    "previous_label": "Apple Q3 2024",
}
RED_FLAGS_JSON = {"red_flags": [{"sentence_index": 1, "quote": "q", "category": "other", "severity": "low", "description": "d"}]}


class FakeGeminiChat(BaseChatModel):
    """Offline stand-in for ChatGoogleGenerativeAI that answers by prompt type."""

    model: str = ""
    google_api_key: str = ""
    temperature: float = 0
    response_mime_type: str | None = None
    instances: list = []

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        FakeGeminiChat.instances.append(self)

    @property
    def _llm_type(self):
        return "fake-gemini"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        text = "\n".join(str(m.content) for m in messages)
        if "follow-up questions" in text:
            reply = "1. What drove margins?\n2. Any guidance change?\n3. How was China?"
        elif "RED FLAGS" in text:
            reply = json.dumps(RED_FLAGS_JSON)
        elif "TRANSCRIPT A" in text:
            reply = "```json\n" + json.dumps(COMPARE_JSON) + "\n```"
        elif "Standalone question:" in text:
            reply = text.rsplit("Follow Up Input:", 1)[-1].split("\n")[0].strip()
        else:
            reply = f"gemini answer to: {text.rsplit('User:', 1)[-1].split(chr(10))[0].strip()}"
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=reply))])


class FakeGeminiEmbeddings(DeterministicFakeEmbedding):
    model: str = ""
    google_api_key: str = ""

    def __init__(self, **kwargs):
        super().__init__(size=16, **kwargs)


def _openai_forbidden(*args, **kwargs):
    raise AssertionError("OpenAI must not be used when OPENAI_API_KEY is unset")


@pytest.fixture
def gemini_only(monkeypatch, tmp_path):
    """Gemini key set, no OpenAI key; Gemini classes faked, every OpenAI entry point poisoned."""
    import langchain_google_genai
    import langchain_openai
    import openai

    import langchain_testing
    import llm_provider

    monkeypatch.setattr(llm_provider, "OPENAI_API_KEY", "")
    monkeypatch.setattr(llm_provider, "GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(llm_provider, "EMBEDDING_PROVIDER", "")
    monkeypatch.setattr(llm_provider, "_openai_unavailable_since", None)
    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", FakeGeminiChat)
    monkeypatch.setattr(langchain_google_genai, "GoogleGenerativeAIEmbeddings", FakeGeminiEmbeddings)
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", _openai_forbidden)
    monkeypatch.setattr(langchain_openai, "OpenAIEmbeddings", _openai_forbidden)
    monkeypatch.setattr(openai, "OpenAI", _openai_forbidden)
    monkeypatch.setattr(langchain_testing, "FAISS_INDEX_ROOT", str(tmp_path / "faiss_indices"))
    monkeypatch.setattr(langchain_testing, "_vectorstores", type(langchain_testing._vectorstores)())
    monkeypatch.chdir(RAG_DIR)  # static transcripts use paths relative to RAG/
    FakeGeminiChat.instances = []
    return tmp_path
