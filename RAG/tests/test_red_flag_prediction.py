"""Unit tests for predictive red-flag hit-rate helpers (no network)."""

from red_flag_prediction import (
    build_options_strategy,
    classify_direction,
    flag_volume_score,
    pattern_for_category,
    rebuild_category_rates,
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
