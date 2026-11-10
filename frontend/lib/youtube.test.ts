import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { extractVideoId } from "./youtube.ts";

const CASES: [string, string | null][] = JSON.parse(
  readFileSync(new URL("../../RAG/tests/youtube_url_cases.json", import.meta.url), "utf8")
);

test("reads every link the same way as the API (RAG/youtube_ids.py)", () => {
  for (const [url, expected] of CASES) {
    assert.equal(extractVideoId(url), expected, url);
  }
});
