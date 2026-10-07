"""Browser origins allowed to call the RAG API."""

import importlib

import pytest
from fastapi.testclient import TestClient

import api_chatbot

FRONTEND = "https://simpli-earn-frontend-abc123-uc.a.run.app"


def preflight(client, origin):
    return client.options("/chat", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
    })


@pytest.fixture
def app_with_origins(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", f" {FRONTEND}/ , https://simpliearn.example.com")
    module = importlib.reload(api_chatbot)  # middleware reads the env at import
    yield TestClient(module.app)
    monkeypatch.undo()
    importlib.reload(api_chatbot)


def test_configured_frontend_origin_passes_preflight(app_with_origins):
    res = preflight(app_with_origins, FRONTEND)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == FRONTEND
    assert preflight(app_with_origins, "https://simpliearn.example.com").status_code == 200


def test_defaults_still_allowed_and_others_rejected(app_with_origins):
    assert preflight(app_with_origins, "http://localhost:3000").status_code == 200
    rejected = preflight(app_with_origins, "https://evil.example.com")
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_cors_origins_parsing():
    assert api_chatbot.cors_origins({}) == api_chatbot.DEFAULT_CORS_ORIGINS
    origins = api_chatbot.cors_origins({"CORS_ALLOWED_ORIGINS": "https://a.run.app/, ,http://localhost:3000"})
    assert origins == api_chatbot.DEFAULT_CORS_ORIGINS + ["https://a.run.app"]
