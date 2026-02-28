"""
Economic Indicators Data Fetcher for SimpliEarn
Fetches VIX, TNX, and DXY intraday data with flexible time windows.
Returns Chart.js-friendly JSON format.
"""

import os
import json
import sys
import pandas as pd
import yfinance as yf
import pytz
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

# Economic indicator tickers
INDICATORS = {
    "VIX": "^VIX",      # Volatility Index
    "TNX": "^TNX",      # 10-Year Treasury Yield
    "DXY": "DX-Y.NYB"   # US Dollar Index
}

NY_TZ = "America/New_York"


def _extract_close_series(df_all: pd.DataFrame, ticker: str, start_local: pd.Timestamp, end_local: pd.Timestamp) -> pd.Series:
    """
    From a yfinance multi-ticker download, extract a tz-aware NY Close series for `ticker`,
    clipped to [start_local, end_local]. Returns empty Series if not found.
    """
    try:
        sub = df_all[ticker]
    except Exception:
        # Fallback for MultiIndex with unexpected shape
        if isinstance(df_all.columns, pd.MultiIndex):
            cols = [c for c in df_all.columns if c[0] == ticker]
            if cols:
                sub = df_all.loc[:, cols]
                sub.columns = [c[1] for c in sub.columns]
            else:
                return pd.Series(dtype=float)
        else:
            return pd.Series(dtype=float)

    s = sub["Close"].copy() if "Close" in sub.columns else sub.squeeze()

    # Ensure tz-aware index in NY time
    idx = s.index
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    s.index = idx.tz_convert(NY_TZ)

    # Clip to requested NY window & drop NA
    s = s[(s.index >= start_local) & (s.index <= end_local)].dropna()
    s.name = ticker
    return s


def get_economic_indicators_json(
    start_local_str: str, 
    hours: int = 48, 
    interval: str = "5m",
    indicators: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Fetch economic indicators intraday data and return Chart.js-friendly JSON.
    
    Args:
        start_local_str: Start time in NY timezone (e.g., "2025-10-20 09:30")
        hours: Number of hours of data to fetch (default: 48)
        interval: Data interval (1m, 5m, 15m, 30m, 1h, etc.)
        indicators: List of indicators to fetch (VIX, TNX, DXY). If None, fetches all.
    
    Returns:
        Dict with Chart.js-friendly structure
    """
    # Default to all indicators if none specified
    if indicators is None:
        indicators = list(INDICATORS.keys())
    
    # Validate indicators
    valid_indicators = [ind for ind in indicators if ind in INDICATORS]
    if not valid_indicators:
        return {"ok": False, "error": "No valid indicators specified"}
    
    # Map to yfinance tickers
    tickers = [INDICATORS[ind] for ind in valid_indicators]
    
    try:
        # 1) Build NY-local window and convert to UTC for download
        start_local = pd.Timestamp(start_local_str).tz_localize(NY_TZ)
        end_local = start_local + pd.Timedelta(hours=hours)
        start_utc = start_local.tz_convert("UTC")
        end_utc = end_local.tz_convert("UTC")

        # 2) Download all tickers - try multiple intervals if needed
        intervals_to_try = [interval, "1h", "15m", "30m", "1d"] if interval != "1h" else [interval, "15m", "30m", "1d"]
        df = None
        
        for interval_to_use in intervals_to_try:
            try:
                df = yf.download(
                    tickers,
                    start=start_utc.to_pydatetime(),
                    end=end_utc.to_pydatetime(),
                    interval=interval_to_use,
                    prepost=True,
                    progress=False,
                    group_by="ticker",
                    auto_adjust=False,
                    threads=True,
                )
                
                if df is not None and not df.empty:
                    interval = interval_to_use  # Update to the interval that worked
                    break
            except Exception as e:
                continue
        
        # If still no data, try with a wider date range using daily data
        if df is None or df.empty:
            try:
                wider_start = start_local - pd.Timedelta(days=7)
                wider_end = end_local + pd.Timedelta(days=7)
                wider_start_utc = wider_start.tz_convert("UTC")
                wider_end_utc = wider_end.tz_convert("UTC")
                
                df = yf.download(
                    tickers,
                    start=wider_start_utc.to_pydatetime(),
                    end=wider_end_utc.to_pydatetime(),
                    interval="1d",
                    prepost=True,
                    progress=False,
                    group_by="ticker",
                    auto_adjust=False,
                    threads=True,
                )
                if df is not None and not df.empty:
                    interval = "1d"
            except Exception:
                pass

        if df is None or df.empty:
            return {
                "ok": False,
                "error": "No data returned from yfinance. The date might be too far in the future or the market was closed.",
                "meta": {
                    "start_local": start_local_str,
                    "hours": hours,
                    "interval": interval,
                    "tz": NY_TZ
                }
            }

        # 3) Extract Close series per ticker and serialize
        out: Dict[str, Any] = {
            "ok": True,
            "data": {},
            "meta": {
                "start_local": start_local_str,
                "hours": hours,
                "interval": interval,
                "tz": NY_TZ,
                "indicators": valid_indicators
            }
        }

        # Track if we have any successful data
        has_any_data = False
        
        for ind_key, tkr in zip(valid_indicators, tickers):
            s = _extract_close_series(df, tkr, start_local, end_local)
            
            if s.empty:
                # Try to download this ticker individually with different intervals
                s = pd.Series(dtype=float)
                for interval_to_use in ["1h", "15m", "30m", "1d"]:
                    try:
                        single_df = yf.download(
                            tkr,
                            start=start_utc.to_pydatetime(),
                            end=end_utc.to_pydatetime(),
                            interval=interval_to_use,
                            prepost=True,
                            progress=False,
                            group_by="ticker",
                            auto_adjust=False,
                            threads=True,
                        )
                        if single_df is not None and not single_df.empty:
                            s = _extract_close_series(single_df, tkr, start_local, end_local)
                            if not s.empty:
                                break
                    except Exception:
                        continue
                
                if s.empty:
                    out["data"][ind_key] = {
                        "timestamps": [],
                        "values": [],
                        "error": f"No data available for {ind_key}. Date might be too far in future/past or market was closed."
                    }
                else:
                    has_any_data = True
                    # Chart.js wants parallel arrays
                    out["data"][ind_key] = {
                        "timestamps": [ts.isoformat() for ts in s.index],
                        "values": [float(v) for v in s.values],
                        "min": float(s.min()),
                        "max": float(s.max()),
                        "mean": float(s.mean())
                    }
            else:
                has_any_data = True
                # Chart.js wants parallel arrays
                out["data"][ind_key] = {
                    "timestamps": [ts.isoformat() for ts in s.index],
                    "values": [float(v) for v in s.values],
                    "min": float(s.min()),
                    "max": float(s.max()),
                    "mean": float(s.mean())
                }

        # If we got no data at all, return error
        if not has_any_data:
            return {
                "ok": False,
                "error": "No data available for any indicators. The date might be too far in the future or past, or the market was closed.",
                "meta": {
                    "start_local": start_local_str,
                    "hours": hours,
                    "interval": interval,
                    "tz": NY_TZ,
                    "indicators": valid_indicators
                },
                "data": out["data"]  # Include partial data with errors
            }

        return out

    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {
                "start_local": start_local_str,
                "hours": hours,
                "interval": interval,
                "tz": NY_TZ
            }
        }


# Main execution for command-line use
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) >= 3:
        start_local_str = sys.argv[1]
        hours = int(sys.argv[2]) if len(sys.argv) > 2 else 48
        interval = sys.argv[3] if len(sys.argv) > 3 else "5m"
        indicators = sys.argv[4].split(",") if len(sys.argv) > 4 and sys.argv[4] else None
        
        # Redirect stdout to stderr for any print statements
        original_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        try:
            result = get_economic_indicators_json(start_local_str, hours, interval, indicators)
            
            # Restore stdout
            sys.stdout = original_stdout
            
            # Output only the JSON result
            print(json.dumps(result))
            
        except Exception as e:
            sys.stdout = original_stdout
            error_json = json.dumps({"ok": False, "error": str(e)})
            print(error_json, file=sys.stderr)
            sys.exit(1)
    else:
        # Interactive mode for testing
        print("Usage: python3 economicIndicatorsV2.py <start_local> <hours> [interval] [indicators]")
        print("Example: python3 economicIndicatorsV2.py '2025-10-20 09:30' 48 5m 'VIX,TNX,DXY'")

