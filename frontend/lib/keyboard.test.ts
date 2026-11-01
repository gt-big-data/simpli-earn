import assert from "node:assert/strict";
import { test } from "node:test";
import { rovingIndex } from "./keyboard.ts";

test("arrow keys step through tabs and wrap at both ends", () => {
  assert.equal(rovingIndex("ArrowRight", 0, 2), 1);
  assert.equal(rovingIndex("ArrowRight", 1, 2), 0);
  assert.equal(rovingIndex("ArrowLeft", 1, 3), 0);
  assert.equal(rovingIndex("ArrowLeft", 0, 3), 2);
});

test("Home and End jump to the first and last tab", () => {
  assert.equal(rovingIndex("Home", 2, 3), 0);
  assert.equal(rovingIndex("End", 0, 3), 2);
});

test("other keys, and an empty row, move nothing", () => {
  for (const key of ["ArrowUp", "ArrowDown", "Tab", "Enter", " ", "a"]) assert.equal(rovingIndex(key, 0, 2), null);
  assert.equal(rovingIndex("ArrowRight", 0, 0), null);
  assert.equal(rovingIndex("Home", 0, 1), 0);
});
