"""/generate-stock and /generate-indicators replace the removed Next.js /api/stock and /api/indicators routes."""

import pytest
from fastapi.testclient import TestClient

import api_chatbot


@pytest.fixture
def client():
    return TestClient(api_chatbot.app)


@pytest.mark.parametrize("payload", [{}, {"ticker": "AAPL"}, {"date": "10/30/24"}, {"ticker": 5, "date": "10/30/24"}])
def test_stock_rejects_missing_input_with_400(client, payload):
    res = client.post("/generate-stock", json=payload)
    assert res.status_code == 400
    assert res.json() == {"error": "Missing ticker or date parameter"}


def test_stock_passes_through_chart_data_and_errors(client, monkeypatch):
    import stockchartgenerationV2

    calls = []

    def fake_chart(ticker, date):
        calls.append((ticker, date))
        if ticker == "NOPE":
            return {"error": "No stock data found for NOPE"}
        return {"ticker": ticker, "timestamps": ["t"], "end_date": "2099-01-01"}

    monkeypatch.setattr(stockchartgenerationV2, "get_stock_chart", fake_chart)

    ok = client.post("/generate-stock", json={"ticker": "ZZZT", "date": "10/30/24"})
    bad = client.post("/generate-stock", json={"ticker": "NOPE", "date": "10/30/24"})

    assert ok.status_code == 200 and ok.json()["ticker"] == "ZZZT"
    assert bad.status_code == 200 and bad.json() == {"error": "No stock data found for NOPE"}
    assert calls == [("ZZZT", "10/30/24"), ("NOPE", "10/30/24")]


@pytest.mark.parametrize("payload, message", [
    ({}, "Missing startLocal parameter"),
    ({"startLocal": ""}, "Missing startLocal parameter"),
    ({"startLocal": "10/30/24", "hours": -1}, "hours must be a number between 0 and 720"),
    ({"startLocal": "10/30/24", "hours": "48"}, "hours must be a number between 0 and 720"),
    ({"startLocal": "10/30/24", "indicators": "VIX"}, "Invalid interval or indicators"),
    ({"startLocal": "10/xx/24 09:30"}, "Invalid request"),
    ({"startLocal": "10/30 09:30"}, "Invalid request"),
])
def test_indicators_reject_bad_input_with_400(client, payload, message):
    res = client.post("/generate-indicators", json=payload)
    assert res.status_code == 400
    body = res.json()
    assert body["ok"] is False and body["error"] == message


def test_indicators_normalize_dates_like_the_old_route(client, monkeypatch):
    import economicIndicatorsV2

    calls = []

    def fake_indicators(start, hours, interval, indicators):
        calls.append((start, hours, interval, indicators))
        return {"ok": True, "series": {}}

    monkeypatch.setattr(economicIndicatorsV2, "get_economic_indicators_json", fake_indicators)

    assert client.post("/generate-indicators", json={"startLocal": "1/5/24"}).json() == {"ok": True, "series": {}}
    client.post("/generate-indicators", json={"startLocal": "2024-10-30 16:30", "hours": 24, "interval": "1h", "indicators": ["VIX"]})

    assert calls == [
        ("2024-01-05 09:30", 48, "5m", ["VIX", "TNX", "DXY"]),
        ("2024-10-30 16:30", 24, "1h", ["VIX"]),
    ]


def test_frontend_no_longer_ships_python_routes():
    from conftest import RAG_DIR

    frontend_app = RAG_DIR.parent / "frontend" / "app"
    assert not (frontend_app / "api" / "stock").exists()
    assert not (frontend_app / "api" / "indicators").exists()
    assert not list(frontend_app.glob("*.py"))


def test_stock_chart_handles_yfinance_multiindex_columns(monkeypatch):
    """yf.download returns (Price, Ticker) columns; pandas 3 rejects assigning the 1-column slice."""
    import pandas as pd

    import stockchartgenerationV2

    index = pd.date_range("2024-10-29 13:00", periods=80, freq="1h", tz="UTC")
    columns = pd.MultiIndex.from_tuples([("Close", "ZZZT"), ("Open", "ZZZT")], names=["Price", "Ticker"])
    frame = pd.DataFrame({("Close", "ZZZT"): range(100, 180), ("Open", "ZZZT"): range(80)}, index=index)
    frame.columns = columns
    monkeypatch.setattr(stockchartgenerationV2.yf, "download", lambda *a, **k: frame.copy())

    result = stockchartgenerationV2.get_stock_chart("ZZZT", "10/30/24")

    assert "error" not in result, result
    assert len(result["prices"]) == 48
    assert all(isinstance(p, float) for p in result["prices"])
    assert result["prices"] == sorted(result["prices"])
