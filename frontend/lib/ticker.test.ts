import assert from "node:assert/strict";
import { test } from "node:test";

import { knownTicker } from "./ticker.ts";

test("placeholders are not tickers", () => {
  for (const value of [null, undefined, "", "  ", "N/A", "n/a", "UNKNOWN", "unknown", " Unknown "]) {
    assert.equal(knownTicker(value), null, String(value));
  }
});

test("real tickers are normalised", () => {
  assert.equal(knownTicker("aapl"), "AAPL");
  assert.equal(knownTicker(" BRK.B "), "BRK.B");
});
