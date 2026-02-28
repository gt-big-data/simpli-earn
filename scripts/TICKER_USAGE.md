# Ticker Symbol Input - Usage Guide

## Why Provide a Ticker?

### ✅ **With Ticker (Recommended):**
```
User inputs: AAPL
Result: ✅ Accurate stock charts for Apple
```

### ❌ **Without Ticker (Auto-Detection):**
```
Title: "Apple Inc. Q1 2025 Earnings Call"
Script guesses: AAPL ✅ (lucky!)

Title: "Q4 2024 Earnings Call and Business Update"  
Script guesses: UNKNOWN ❌ (no stock charts!)
```

---

## How It Works Now

### Frontend (User Experience)

```
┌─────────────────────────────────────────┐
│ Paste call link here....                │
│ https://youtube.com/watch?v=...         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Ticker Symbol (optional but recommended)│
│ AAPL                                    │
│ Helps us show accurate stock charts     │
└─────────────────────────────────────────┘
```

**User can:**
- Enter ticker → Guaranteed accurate stock charts
- Leave blank → Script tries to detect from title

### Backend Pipeline

```python
# 1. User provides ticker
POST /dashboard/create-dashboard
{
  "youtube_url": "...",
  "ticker": "AAPL"  // ← User input
}

# 2. Script uses it directly
✅ Ticker: AAPL (provided by user)
✅ Stock chart: Accurate AAPL data

# OR if no ticker provided:
{
  "youtube_url": "...",
  "ticker": null
}

# Script tries to guess
⚠️  Ticker: UNKNOWN (auto-detected)
❌ Stock chart: May fail or show wrong data
```

---

## Command Line Usage

### With Ticker (Recommended):
```bash
python scripts/create_dashboard_from_youtube.py \
  "https://youtube.com/watch?v=..." \
  --ticker AAPL
```

### Without Ticker (Auto-Detect):
```bash
python scripts/create_dashboard_from_youtube.py \
  "https://youtube.com/watch?v=..."
```

### Help:
```bash
python scripts/create_dashboard_from_youtube.py --help
```

---

## Detection Algorithm (Fallback)

If user doesn't provide ticker, the script tries:

### 1. Regex Patterns:
- `(AAPL)` - ticker in parentheses
- `AAPL Q1` - ticker before quarter
- `AAPL ` - ticker at start

### 2. Company Name Mapping:
```python
{
  'Apple': 'AAPL',
  'Google': 'GOOGL',
  'Alphabet': 'GOOGL',
  'Tesla': 'TSLA',
  'Microsoft': 'MSFT',
  'Amazon': 'AMZN',
  'Meta': 'META',
  'Walmart': 'WMT',
  'CVS': 'CVS',
  'Shell': 'SHEL',
}
```

### 3. Fallback:
If nothing matches → `"UNKNOWN"`

---

## Common Ticker Symbols

### Tech:
- Apple: **AAPL**
- Google/Alphabet: **GOOGL**
- Microsoft: **MSFT**
- Amazon: **AMZN**
- Meta/Facebook: **META**
- Tesla: **TSLA**
- NVIDIA: **NVDA**
- Netflix: **NFLX**

### Retail:
- Walmart: **WMT**
- Target: **TGT**
- Costco: **COST**
- Home Depot: **HD**

### Finance:
- JPMorgan: **JPM**
- Bank of America: **BAC**
- Wells Fargo: **WFC**
- Goldman Sachs: **GS**

### Healthcare:
- CVS: **CVS**
- UnitedHealth: **UNH**
- Johnson & Johnson: **JNJ**
- Pfizer: **PFE**

### Energy:
- Shell: **SHEL**
- ExxonMobil: **XOM**
- Chevron: **CVX**

---

## API Response

```json
{
  "job_id": "uuid",
  "status": "pending",
  "message": "Dashboard creation started",
  "ticker_provided": true  // ← Indicates if user gave ticker
}
```

---

## Best Practices

### ✅ DO:
- Provide ticker for all custom uploads
- Use uppercase (AAPL, not aapl)
- Verify ticker is correct on Yahoo Finance
- Check ticker before submitting

### ❌ DON'T:
- Leave blank unless confident title has ticker
- Use company name instead of ticker
- Use multiple tickers
- Use invalid/delisted tickers

---

## Troubleshooting

### "Stock chart shows wrong company"
→ Provide correct ticker manually

### "No stock data available"
→ Ticker was set to "UNKNOWN", re-upload with ticker

### "Invalid ticker symbol"
→ Check if ticker exists on Yahoo Finance

### "Stock chart is empty"
→ Earnings date might be weekend/holiday, chart uses nearest trading day

---

## Example Workflow

### ❌ Bad (No Ticker):
```
1. Paste: "Q4 2024 Earnings Results"
2. Leave ticker blank
3. Script guesses: UNKNOWN
4. Stock charts don't work 😞
```

### ✅ Good (With Ticker):
```
1. Paste: "Q4 2024 Earnings Results"  
2. Enter ticker: AAPL
3. Script uses: AAPL
4. Stock charts work perfectly! 🎉
```

---

## Summary

**Providing the ticker symbol:**
- ✅ Ensures accurate stock visualizations
- ✅ Faster processing (no guessing)
- ✅ Works for any video title
- ✅ Prevents "UNKNOWN" errors
- ✅ Better user experience

**Only 5 characters → Huge improvement! 🚀**

