"""Unit tests for predictive red-flag hit-rate helpers (no network)."""

from red_flag_prediction import (
    build_options_strategy,
    classify_direction,
    configure_supabase,
    flag_volume_score,
    load_history_from_supabase,
    pattern_for_category,
    rebuild_category_rates,
    save_history_to_supabase,
    _default_seed,
)


def test_classify_direction_thresholds():
    assert classify_direction(-0.6) == "down"
    assert classify_direction(0.6) == "up"
    assert classify_direction(0.2) == "flat"
    assert classify_direction(-0.2) == "flat"


def test_rebuild_and_pattern_for_category():
    data = {
        "threshold_pct": 0.5,
        "calls": {
            "1": {"categories": ["margin_pressure", "guidance_change"], "direction": "down"},
            "2": {"categories": ["margin_pressure"], "direction": "down"},
            "3": {"categories": ["guidance_change"], "direction": "up"},
        },
        "by_category": {},
    }
    rebuild_category_rates(data)
    mp = pattern_for_category("margin_pressure", data)
    assert mp is not None
    assert mp["direction"] == "down"
    assert mp["sample_size"] == 2
    assert mp["hit_rate"] == 1.0
    gc = pattern_for_category("guidance_change", data)
    assert gc is not None
    assert gc["sample_size"] == 2


def test_flag_volume_and_put_strategy():
    flags = [
        {"severity": "high", "category": "margin_pressure"},
        {"severity": "high", "category": "guidance_change"},
        {"severity": "medium", "category": "debt_leverage"},
    ]
    vol = flag_volume_score(flags)
    assert vol["count"] == 3
    assert vol["level"] in ("moderate", "elevated")
    strat = build_options_strategy(
        expected="down",
        volume=vol,
        actual={"direction": "down", "next_open_pct": -2.5, "ticker": "AAPL"},
        ticker="AAPL",
    )
    assert strat["action"] == "buy_put"
    assert strat["instrument"] == "put"
    assert strat["retrospective"]["direction_correct"] is True


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, store):
        self.store = store
        self._rows = None

    def select(self, *_a, **_k):
        return self

    def upsert(self, rows, on_conflict=None):
        self._rows = rows
        for row in rows:
            self.store[row["call_key"]] = dict(row)
        return self

    def execute(self):
        if self._rows is not None:
            return _FakeResult(self._rows)
        return _FakeResult(list(self.store.values()))


class _FakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, _name):
        return _FakeTable(self.store)


def test_supabase_history_roundtrip():
    fake = _FakeSupabase()
    configure_supabase(fake)
    try:
        data = _default_seed()
        data["calls"]["1"] = {
            "ticker": "AAPL",
            "date": "2/2/25",
            "categories": ["guidance_change"],
            "next_open_pct": -2.5,
            "direction": "down",
            "prior_close": 100.0,
            "next_open": 97.5,
            "next_open_date": "2025-02-03",
        }
        assert save_history_to_supabase(data) is True
        assert "1" in fake.store
        loaded = load_history_from_supabase()
        assert loaded is not None
        assert loaded["calls"]["1"]["direction"] == "down"
        assert loaded["calls"]["1"]["categories"] == ["guidance_change"]
        assert loaded["by_category"]["guidance_change"]["dominant"] == "down"
    finally:
        configure_supabase(None)
