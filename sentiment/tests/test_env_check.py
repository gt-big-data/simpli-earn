"""Startup configuration validation for the sentiment API."""

import pytest

import env_check

BASE = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "k", "LIBRARY_ADMIN_EMAILS": "a@b.c"}


def test_complete_config_is_valid():
    assert env_check.check_environment(BASE) == ([], [])


@pytest.mark.parametrize("overrides, fragment", [
    ({"SUPABASE_URL": ""}, "Set SUPABASE_URL"),
    ({"SUPABASE_KEY": ""}, "Set SUPABASE_KEY"),
    ({"SUPABASE_URL": "ftp://x"}, "must be an http(s) URL"),
])
def test_required_settings_are_errors(overrides, fragment):
    errors, _ = env_check.check_environment({**BASE, **overrides})
    assert any(fragment in e for e in errors), errors


def test_missing_admins_is_a_warning():
    errors, warnings = env_check.check_environment({**BASE, "LIBRARY_ADMIN_EMAILS": ""})
    assert errors == [] and any("LIBRARY_ADMIN" in w for w in warnings)


def test_strict_mode_refuses_to_start(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("STRICT_CONFIG", "true")
    with pytest.raises(RuntimeError):
        env_check.validate_environment()
