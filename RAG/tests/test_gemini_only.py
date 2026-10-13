"""Gemini-only operation: with no OPENAI_API_KEY, chat, retrieval, compare and red flags use Gemini."""

import os

import pytest
from fastapi.testclient import TestClient

import langchain_testing
import llm_provider
from conftest import FakeGeminiChat, FakeGeminiEmbeddings


@pytest.fixture
def client(gemini_only):
    import api_chatbot

    return TestClient(api_chatbot.app)


def test_provider_selection_without_openai_key(gemini_only):
    assert llm_provider.get_active_provider() == "gemini"
    assert isinstance(llm_provider.get_llm(), FakeGeminiChat)
    embeddings, namespace = llm_provider.get_embeddings()
    assert isinstance(embeddings, FakeGeminiEmbeddings)
    assert embeddings.model == "gemini-embedding-001"
    assert namespace == "gemini-gemini-embedding-001"
    assert llm_provider.get_json_llm().response_mime_type == "application/json"
    assert llm_provider.get_model_name() == "gemini-3.1-flash-lite"


def test_no_provider_raises_clear_error(gemini_only, monkeypatch):
    monkeypatch.setattr(llm_provider, "GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="No embedding provider"):
        llm_provider.get_embeddings()
    with pytest.raises(RuntimeError, match="No LLM provider"):
        llm_provider.get_json_llm()


def test_pinned_embedding_provider_without_key_fails_loudly(gemini_only, monkeypatch):
    monkeypatch.setattr(llm_provider, "EMBEDDING_PROVIDER", "openai")
    with pytest.raises(RuntimeError, match="EMBEDDING_PROVIDER=openai"):
        llm_provider.get_embeddings()


def test_index_is_namespaced_by_embedding_model(gemini_only):
    _, content_hash = langchain_testing.initialize_retrieval("transcripts/apple_seeking_alpha.txt")

    root = gemini_only / "faiss_indices"
    assert os.listdir(root) == ["gemini-gemini-embedding-001"]
    assert os.path.isdir(root / "gemini-gemini-embedding-001" / f"faiss_index_{content_hash}")


def test_legacy_openai_index_is_not_loaded_for_gemini(gemini_only):
    with open("transcripts/apple_seeking_alpha.txt", encoding="utf-8") as f:
        content_hash = langchain_testing.generate_content_hash(f.read())
    legacy = gemini_only / "faiss_indices" / f"faiss_index_{content_hash}"
    legacy.mkdir(parents=True)
    (legacy / "index.faiss").write_bytes(b"not a gemini index")

    retriever, _ = langchain_testing.initialize_retrieval("transcripts/apple_seeking_alpha.txt")

    assert retriever.invoke("revenue")  # built fresh with Gemini vectors, legacy dir ignored
    assert (gemini_only / "faiss_indices" / "gemini-gemini-embedding-001" / f"faiss_index_{content_hash}").is_dir()


def test_openai_quota_during_embedding_falls_back_to_gemini_index(gemini_only, monkeypatch):
    import langchain_openai

    class QuotaEmbeddings(FakeGeminiEmbeddings):
        api_key: str = ""

        def embed_documents(self, texts):
            raise RuntimeError("Error code: 429 - insufficient_quota")

    monkeypatch.setattr(llm_provider, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(langchain_openai, "OpenAIEmbeddings", QuotaEmbeddings)

    retriever, _ = langchain_testing.initialize_retrieval("transcripts/apple_seeking_alpha.txt")

    assert llm_provider.get_active_provider() == "gemini"
    assert isinstance(retriever.vectorstore.embeddings, FakeGeminiEmbeddings)
    assert not isinstance(retriever.vectorstore.embeddings, QuotaEmbeddings)
    assert os.listdir(gemini_only / "faiss_indices") == ["gemini-gemini-embedding-001"]


def test_chat_endpoint_gemini_only(client):
    res = client.post("/chat", json={"message": "How did revenue do?", "id": "1"})

    assert res.status_code == 200
    body = res.json()
    assert body["response"] == "gemini answer to: How did revenue do?"
    assert body["provider"] == "gemini"
    assert body["sources"] and all("text" in s for s in body["sources"])
    assert body["suggestions"] == ["What drove margins?", "Any guidance change?", "How was China?"]


def test_compare_endpoint_gemini_only(client):
    res = client.post("/compare", json={"current_id": "aapl_2024Q4", "previous_id": "aapl_2024Q3"})

    body = res.json()
    assert "error" not in body, body
    assert body["sentiment"] == {"current": 7, "previous": 5, "delta": 2, "direction": "up"}
    assert body["narrative_shifts"] == ["a", "b", "c"]
    assert any(m.response_mime_type == "application/json" for m in FakeGeminiChat.instances)


def test_red_flags_endpoint_gemini_only(client, monkeypatch):
    import api_chatbot

    saved = {}

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *_):
            return self

        def eq(self, *_):
            return self

        def update(self, data):
            saved.update(data)
            return self

        def execute(self):
            return type("R", (), {"data": [{"relevance_filename": "rel.csv", "red_flags": None}]})()

    class Storage:
        def from_(self, _bucket):
            return self

        def download(self, _name):
            return b"sentence_index,sentence_text\n0,Revenue grew.\n1,We may revise guidance.\n"

    fake_supabase = type("SB", (), {"table": lambda self, t: Query(t), "storage": Storage()})()
    monkeypatch.setattr(api_chatbot, "supabase", fake_supabase)

    body = client.post("/red-flags", json={"dashboard_id": "1"}).json()

    assert body == {"red_flags": RED_FLAGS_JSON_EXPECTED}
    assert saved["red_flags"]["model"] == "gemini-3.1-flash-lite"


RED_FLAGS_JSON_EXPECTED = [{"sentence_index": 1, "quote": "q", "category": "other", "severity": "low", "description": "d"}]


@pytest.mark.parametrize("raw", [
    '{"a": 1}',
    '```json\n{"a": 1}\n```',
    'Here you go: {"a": 1} hope that helps',
])
def test_parse_json_object_variants(raw):
    assert llm_provider.parse_json_object(raw) == {"a": 1}


def test_parse_json_object_rejects_non_object():
    with pytest.raises(ValueError):
        llm_provider.parse_json_object("[1, 2]")
