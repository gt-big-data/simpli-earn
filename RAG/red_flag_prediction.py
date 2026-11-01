"""
Predictive layer for red flags: after-hours call → next trading open.

Uses the same yfinance stack as stock charts. Builds a simple historical
hit-rate table per flag category from preloaded calls (+ live updates).
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

THRESHOLD_PCT = 0.5  # |move| < 0.5% => flat
SEED_PATH = os.path.join(os.path.dirname(__file__), "data", "red_flag_hit_rates.json")

# Same ticker/date mapping as frontend ChartsFrame (earnings day; treat as after-hours)
PRELOADED_CALLS: Dict[str, Dict[str, str]] = {
    "1": {"ticker": "AAPL", "date": "2/2/25"},
    "2": {"ticker": "CVS", "date": "11/6/24"},
    "3": {"ticker": "GOOGL", "date": "2/4/25"},
    "4": {"ticker": "SHEL", "date": "1/30/25"},
    "5": {"ticker": "TSLA", "date": "1/29/25"},
    "6": {"ticker": "WMT", "date": "2/20/25"},
}

# Bootstrap categories until live /red-flags updates rewrite them for a call
_BOOTSTRAP_CATEGORIES: Dict[str, List[str]] = {
    "1": ["guidance_change", "margin_pressure", "regulatory_legal"],
    "2": ["guidance_change", "margin_pressure"],
    "3": ["margin_pressure", "regulatory_legal", "debt_leverage"],
    "4": ["vague_evasive", "guidance_change"],
    "5": ["vague_evasive", "guidance_change", "other"],
    "6": ["margin_pressure", "guidance_change"],
}


def classify_direction(pct: float, threshold: float = THRESHOLD_PCT) -> str:
    if pct <= -threshold:
        return "down"
    if pct >= threshold:
        return "up"
    return "flat"


def parse_earnings_date(date_str: str) -> datetime:
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date: {date_str}")


def get_next_open_move(ticker: str, earnings_date_str: str) -> Optional[Dict[str, Any]]:
    """
    After-hours earnings on date D → compare prior close (on/before D)
    to the next trading day's open.
    """
    try:
        d = parse_earnings_date(earnings_date_str)
        start = d - timedelta(days=7)
        end = d + timedelta(days=12)
        df = yf.download(
            ticker.upper(),
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )
        if df is None or df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df.sort_index()

        prior = df.loc[: d.strftime("%Y-%m-%d")]
        if prior.empty:
            return None
        prior_close = float(prior["Close"].iloc[-1])
        prior_date = prior.index[-1]
        prior_date_str = str(prior_date.date() if hasattr(prior_date, "date") else prior_date)

        after = df.loc[df.index > pd.Timestamp(d)]
        if after.empty:
            return None
        next_open = float(after["Open"].iloc[0])
        next_date = after.index[0]
        next_date_str = str(next_date.date() if hasattr(next_date, "date") else next_date)
        pct = (next_open - prior_close) / prior_close * 100.0
        direction = classify_direction(pct)
        return {
            "ticker": ticker.upper(),
            "earnings_date": d.strftime("%Y-%m-%d"),
            "prior_close_date": prior_date_str,
            "prior_close": round(prior_close, 4),
            "next_open_date": next_date_str,
            "next_open": round(next_open, 4),
            "next_open_pct": round(pct, 3),
            "direction": direction,
            "window": "after-hours call → next trading open",
        }
    except Exception as e:
        print(f"next-open move error for {ticker} {earnings_date_str}: {e}")
        return None


def _default_seed() -> Dict[str, Any]:
    return {
        "threshold_pct": THRESHOLD_PCT,
        "window": "after-hours call → next trading open",
        "calls": {},
        "by_category": {},
    }


def load_seed() -> Dict[str, Any]:
    if not os.path.exists(SEED_PATH):
        return _default_seed()
    try:
        with open(SEED_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("calls", {})
        data.setdefault("by_category", {})
        data.setdefault("threshold_pct", THRESHOLD_PCT)
        return data
    except Exception:
        return _default_seed()


def save_seed(data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(SEED_PATH), exist_ok=True)
    with open(SEED_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def rebuild_category_rates(data: Dict[str, Any]) -> Dict[str, Any]:
    counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {"down": 0, "flat": 0, "up": 0})
    for call in data.get("calls", {}).values():
        direction = call.get("direction")
        if direction not in ("down", "flat", "up"):
            continue
        for cat in call.get("categories") or []:
            counts[cat][direction] += 1
    by_category = {}
    for cat, c in counts.items():
        n = c["down"] + c["flat"] + c["up"]
        if n == 0:
            continue
        # Dominant direction for this category
        dominant = max(("down", "flat", "up"), key=lambda k: c[k])
        by_category[cat] = {
            **c,
            "n": n,
            "dominant": dominant,
            "hit_rate": round(c[dominant] / n, 3),
        }
    data["by_category"] = by_category
    return data


def ensure_call_outcomes(data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Fill next-open outcomes for preloaded calls (fetch via yfinance if missing)."""
    data = data or load_seed()
    changed = False
    for dashboard_id, meta in PRELOADED_CALLS.items():
        existing = data["calls"].get(dashboard_id)
        if existing and existing.get("next_open_pct") is not None and existing.get("direction"):
            if not existing.get("categories"):
                existing["categories"] = list(_BOOTSTRAP_CATEGORIES.get(dashboard_id, []))
                changed = True
            continue
        move = get_next_open_move(meta["ticker"], meta["date"])
        if not move:
            continue
        data["calls"][dashboard_id] = {
            "ticker": meta["ticker"],
            "date": meta["date"],
            "categories": list(
                (existing or {}).get("categories")
                or _BOOTSTRAP_CATEGORIES.get(dashboard_id, [])
            ),
            "next_open_pct": move["next_open_pct"],
            "direction": move["direction"],
            "prior_close": move["prior_close"],
            "next_open": move["next_open"],
            "next_open_date": move["next_open_date"],
        }
        changed = True
    if changed:
        rebuild_category_rates(data)
        save_seed(data)
    return data


def update_call_categories(dashboard_id: str, categories: List[str]) -> None:
    """When live flags arrive for a preloaded call, replace bootstrap categories."""
    if not dashboard_id or dashboard_id not in PRELOADED_CALLS:
        return
    cats = sorted({c for c in categories if c})
    if not cats:
        return
    data = ensure_call_outcomes()
    call = data["calls"].get(dashboard_id)
    if not call:
        return
    if set(call.get("categories") or []) == set(cats):
        return
    call["categories"] = cats
    call["categories_source"] = "live_red_flags"
    rebuild_category_rates(data)
    save_seed(data)


def pattern_for_category(category: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    data = data or ensure_call_outcomes()
    stats = data.get("by_category", {}).get(category)
    if not stats or stats.get("n", 0) < 1:
        return None
    dominant = stats["dominant"]
    n = stats["n"]
    hits = stats[dominant]
    hit_rate = stats["hit_rate"]
    label = {
        "down": "next-open drop",
        "up": "next-open rise",
        "flat": "flat next open",
    }.get(dominant, dominant)
    return {
        "direction": dominant,
        "hit_rate": hit_rate,
        "sample_size": n,
        "summary": (
            f"Past after-hours calls with {category.replace('_', ' ')}: "
            f"{label} {hits}/{n} times ({hit_rate:.0%})."
        ),
    }


def flag_volume_score(flags: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Ritwij: high volumes of red flags as a bearish intensity signal."""
    n = len(flags)
    high = sum(1 for f in flags if (f.get("severity") or "").lower() == "high")
    medium = sum(1 for f in flags if (f.get("severity") or "").lower() == "medium")
    low = sum(1 for f in flags if (f.get("severity") or "").lower() == "low")
    # Weighted volume: high counts more
    score = high * 2.0 + medium * 1.0 + low * 0.5
    if score >= 6 or high >= 3:
        level = "elevated"
    elif score >= 3 or high >= 1:
        level = "moderate"
    elif n > 0:
        level = "low"
    else:
        level = "none"
    return {
        "count": n,
        "high": high,
        "medium": medium,
        "low": low,
        "weighted_score": round(score, 2),
        "level": level,
        "summary": f"{n} flags ({high} high) → volume {level}",
    }


def build_options_strategy(
    expected: Optional[str],
    volume: Dict[str, Any],
    actual: Optional[Dict[str, Any]] = None,
    ticker: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Paper strategy recommendation (no live broker).
    If we expect a drop at open → buy put after hours; if rise → buy call.
    Includes a simple retrospective check when actual next-open is known.
    """
    sym = (ticker or actual.get("ticker") if actual else None) or "TICKER"
    volume_level = volume.get("level") or "none"

    # Volume can strengthen a down lean (many red flags)
    if expected == "flat" and volume_level == "elevated":
        expected = "down"

    if expected == "down":
        action = "buy_put"
        thesis = (
            f"After-hours red flags lean down into the open → paper strategy: "
            f"buy a short-dated put on {sym}, then benefit if price gaps down at open."
        )
    elif expected == "up":
        action = "buy_call"
        thesis = (
            f"Signal leans up into the open → paper strategy: "
            f"buy a short-dated call on {sym} after hours."
        )
    else:
        action = "no_trade"
        thesis = "Signal is flat/unclear → sit out (no options trade)."

    # Retrospective: did direction match? (not real options P&L — directional correctness only)
    retrospective = None
    if actual and actual.get("direction") and expected in ("down", "up"):
        matched = actual["direction"] == expected
        pct = actual.get("next_open_pct")
        retrospective = {
            "direction_correct": matched,
            "actual_direction": actual.get("direction"),
            "actual_next_open_pct": pct,
            "note": (
                "Directional check only (not real options P&L). "
                + (
                    f"Prediction matched next open ({pct:+.2f}%)."
                    if matched and pct is not None
                    else f"Prediction missed next open ({pct:+.2f}%)."
                    if pct is not None
                    else ("Prediction matched next open." if matched else "Prediction missed next open.")
                )
            ),
        }

    return {
        "mode": "paper",
        "action": action,
        "instrument": "put" if action == "buy_put" else ("call" if action == "buy_call" else None),
        "timing": "enter after hours → evaluate at next open",
        "ticker": sym,
        "thesis": thesis,
        "volume": volume,
        "retrospective": retrospective,
        "disclaimer": "Educational paper signal only — not live brokerage execution.",
    }


def call_level_prediction(
    flags: List[Dict[str, Any]],
    dashboard_id: Optional[str] = None,
    ticker: Optional[str] = None,
    date: Optional[str] = None,
) -> Dict[str, Any]:
    data = ensure_call_outcomes()
    votes = {"down": 0.0, "flat": 0.0, "up": 0.0}
    used = 0
    for f in flags:
        pattern = pattern_for_category(f.get("category") or "", data)
        if not pattern:
            continue
        severity = (f.get("severity") or "medium").lower()
        weight = {"high": 1.5, "medium": 1.0, "low": 0.6}.get(severity, 1.0)
        votes[pattern["direction"]] += weight * pattern["hit_rate"]
        used += 1

    volume = flag_volume_score(flags)

    if used == 0:
        # Cohort fallback from preloaded after-hours sample
        dirs = [c["direction"] for c in data.get("calls", {}).values() if c.get("direction")]
        if dirs:
            dominant = max(set(dirs), key=dirs.count)
            expected = dominant
            reason = f"Insufficient category history; cohort next-open was {dominant} in {dirs.count(dominant)}/{len(dirs)} preloaded after-hours calls."
        else:
            expected = None
            reason = "Not enough historical data yet."
    else:
        expected = max(votes, key=votes.get)
        reason = f"{used} flag categories with history lean {expected} at next open."
        if volume["level"] == "elevated" and expected != "down":
            reason += " Elevated flag volume adds bearish pressure."

    out: Dict[str, Any] = {
        "expected_next_open": expected,
        "reason": reason,
        "window": "after-hours call → next trading open",
        "threshold_pct": THRESHOLD_PCT,
        "flag_volume": volume,
    }

    # Attach actual next-open for this call when known (demo / validation)
    actual = None
    resolved_ticker = ticker
    if dashboard_id and dashboard_id in data.get("calls", {}):
        c = data["calls"][dashboard_id]
        actual = {
            "next_open_pct": c.get("next_open_pct"),
            "direction": c.get("direction"),
            "ticker": c.get("ticker"),
            "date": c.get("date"),
        }
        resolved_ticker = c.get("ticker") or resolved_ticker
    elif ticker and date:
        move = get_next_open_move(ticker, date)
        if move:
            actual = {
                "next_open_pct": move["next_open_pct"],
                "direction": move["direction"],
                "ticker": move["ticker"],
                "date": date,
            }
            resolved_ticker = move["ticker"]
    if actual:
        out["actual_next_open"] = actual

    out["strategy"] = build_options_strategy(
        expected=expected,
        volume=volume,
        actual=actual,
        ticker=resolved_ticker,
    )
    return out


def enrich_flags(
    flags: List[Dict[str, Any]],
    dashboard_id: Optional[str] = None,
    ticker: Optional[str] = None,
    date: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Attach historical_pattern to each flag + call-level prediction/strategy."""
    data = ensure_call_outcomes()
    cats = [f.get("category") for f in flags if f.get("category")]
    if dashboard_id:
        update_call_categories(dashboard_id, cats)
        data = load_seed()

    enriched = []
    for f in flags:
        item = dict(f)
        pattern = pattern_for_category(item.get("category") or "", data)
        if pattern:
            item["historical_pattern"] = pattern
        enriched.append(item)

    prediction = call_level_prediction(enriched, dashboard_id=dashboard_id, ticker=ticker, date=date)
    return enriched, prediction
