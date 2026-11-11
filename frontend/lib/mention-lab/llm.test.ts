import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, parseLadder, validate } from "./llm.ts";

const req = { company: "Apple", word: "AI", strikes: [1, 5, 10], history: [{ label: "Q1", count: 7 }, { label: "Q2", count: 6 }] };

test("prompt carries history and context but never prices", () => {
  const p = buildPrompt({ ...req, context: "Press release mentions AI twice." });
  assert.match(p, /- Q1: 7/);
  assert.match(p, /Press release/);
  assert.doesNotMatch(p, /price|¢/i);
});

test("validate rejects bad bodies", () => {
  assert.equal(validate(req), null);
  assert.match(validate({ ...req, strikes: [0] })!, /strikes/);
  assert.match(validate({ ...req, word: "" })!, /word/);
  assert.match(validate({ ...req, history: [{ label: "x", count: -1 }] })!, /history/);
  assert.match(validate(null)!, /object/);
});

test("parseLadder makes the ladder monotone, clips, and accepts percents and fences", () => {
  const out = parseLadder('```json\n{"probabilities": {"1": 0.9, "5": 0.95, "10": 30}, "expected_count": 6, "rationale": "r"}\n```', [1, 5, 10]);
  assert.deepEqual(out.raw, [0.9, 0.95, 0.3]);
  assert.deepEqual(out.ladder.map((v) => +v.toFixed(3)), [0.925, 0.925, 0.3]);
  assert.equal(out.expectedCount, 6);
  assert.throws(() => parseLadder('{"probabilities": {"1": 0.5}}', [1, 5]), /strike 5/);
  assert.throws(() => parseLadder("no json here", [1]), /JSON/);
});
