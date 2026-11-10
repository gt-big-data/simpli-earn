// The pipeline stores "UNKNOWN" when it cannot detect a ticker, and the library shows "N/A" for none.
// Neither is a symbol, so neither may reach the stock chart.
const PLACEHOLDERS = new Set(["", "N/A", "UNKNOWN"]);

/** Upper-cased ticker, or null for a missing or placeholder value. */
export function knownTicker(value: string | null | undefined): string | null {
  const ticker = value?.trim().toUpperCase() ?? "";
  return PLACEHOLDERS.has(ticker) ? null : ticker;
}
