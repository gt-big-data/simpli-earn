"""Startup configuration validation for the RAG API."""

import pytest

import env_check

BASE = {"GEMINI_API_KEY": "g", "SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "k", "ASSEMBLYAI_KEY": "a"}


def test_complete_gemini_only_config_is_valid():
    assert env_check.check_environment(BASE) == ([], [])


@pytest.mark.parametrize("overrides, fragment", [
    ({"GEMINI_API_KEY": ""}, "OPENAI_API_KEY or GEMINI_API_KEY"),
    ({"SUPABASE_URL": ""}, "Set SUPABASE_URL"),
    ({"SUPABASE_KEY": "  "}, "Set SUPABASE_KEY"),
    ({"SUPABASE_URL": "proj.supabase.co"}, "must be an http(s) URL"),
    ({"EMBEDDING_PROVIDER": "cohere"}, "EMBEDDING_PROVIDER must be"),
    ({"EMBEDDING_PROVIDER": "openai"}, "requires OPENAI_API_KEY"),
])
def test_required_settings_are_errors(overrides, fragment):
    errors, _ = env_check.check_environment({**BASE, **overrides})
    assert any(fragment in e for e in errors), errors


def test_assemblyai_only_warns_and_only_without_home_worker():
    _, warnings = env_check.check_environment({**BASE, "ASSEMBLYAI_KEY": ""})
    assert any("ASSEMBLYAI_KEY" in w for w in warnings)
    assert env_check.check_environment({**BASE, "ASSEMBLYAI_KEY": "", "YOUTUBE_HOME_WORKER": "1"}) == ([], [])


def test_strict_mode_refuses_to_start(monkeypatch, capsys):
    for name in BASE:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("STRICT_CONFIG", "1")
    with pytest.raises(RuntimeError, match="STRICT_CONFIG=1"):
        env_check.validate_environment()


def test_non_strict_mode_reports_and_continues(monkeypatch, capsys):
    for name in BASE:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("STRICT_CONFIG", "0")
    env_check.validate_environment()
    assert "Set SUPABASE_URL" in capsys.readouterr().out
