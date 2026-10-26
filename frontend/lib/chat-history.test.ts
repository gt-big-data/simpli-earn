// Run with `npm test` (Node 22.18+ runs TypeScript directly; no test framework needed).
import assert from "node:assert/strict";
import { test } from "node:test";

import { chatTitle, historyFor, isBlank, MAX_ANSWER_CHARS, MAX_HISTORY_TURNS, nextMessageId, type ChatMessage } from "./chat-history.ts";

const SRC = "1|";
const user = (id: number, text: string, source = SRC): ChatMessage => ({ id: String(id), sender: "user", text, source });
const bot = (id: number, replyTo: number, text: string, source = SRC): ChatMessage =>
  ({ id: String(id), sender: "bot", text, source, replyTo: String(replyTo) });
const greeting: ChatMessage = { id: "greeting", sender: "bot", text: "Hi, I'm SimpliBot!" };

test("pairs replies with their own question when sends overlap", () => {
  // user1, user2, bot1, bot2: the second question was sent before the first reply arrived
  const messages = [greeting, user(2, "q1"), user(3, "q2"), bot(4, 2, "a1"), bot(5, 3, "a2")];
  assert.deepEqual(historyFor(messages, SRC), [
    { question: "q1", answer: "a1" },
    { question: "q2", answer: "a2" },
  ]);
});

test("replies arriving out of order still pair correctly", () => {
  const messages = [user(2, "q1"), user(3, "q2"), bot(4, 3, "a2"), bot(5, 2, "a1")];
  assert.deepEqual(historyFor(messages, SRC), [
    { question: "q1", answer: "a1" },
    { question: "q2", answer: "a2" },
  ]);
});

test("unanswered questions, failed replies and the greeting are left out", () => {
  const messages = [greeting, user(2, "q1"), bot(3, 2, "⚠️ No response from server."), user(4, "pending")];
  assert.deepEqual(historyFor(messages, SRC), []);
});

test("only turns about the current transcript are sent", () => {
  const messages = [user(2, "apple?", "1|"), bot(3, 2, "apple."), user(4, "tesla?", "5|"), bot(5, 4, "tesla.", "5|")];
  assert.deepEqual(historyFor(messages, "5|"), [{ question: "tesla?", answer: "tesla." }]);
});

test("history is trimmed to the API's limits", () => {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < MAX_HISTORY_TURNS + 5; i++) {
    messages.push(user(100 + 2 * i, `q${i}`), bot(101 + 2 * i, 100 + 2 * i, "a".repeat(MAX_ANSWER_CHARS + 50)));
  }
  const history = historyFor(messages, SRC);
  assert.equal(history.length, MAX_HISTORY_TURNS);
  assert.equal(history[0].question, "q5");
  assert.ok(history.every((turn) => turn.answer.length === MAX_ANSWER_CHARS));
});

test("message ids are unique and never reuse the greeting's id", () => {
  const ids = new Set(Array.from({ length: 100 }, () => nextMessageId()));
  assert.equal(ids.size, 100);
  assert.ok(!ids.has("greeting"));
});

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test("chat titles: a 500-character question clips to 100 characters", () => {
  const title = chatTitle("Why did margins fall? ".repeat(23)); // 506 characters
  assert.equal(Array.from(title).length <= 100, true);
  assert.equal(title, "Why did margins fall? ".repeat(23).slice(0, 100).trim());
});

test("chat titles: whitespace is collapsed and trimmed, before and after clipping", () => {
  assert.equal(chatTitle("  \n\t What   was\n\nrevenue? \u00a0 "), "What was revenue?");
  // The 100th character is a space: clipping leaves it trailing, so the title is trimmed again
  assert.equal(chatTitle(`${"a".repeat(99)} ${"b".repeat(50)}`), "a".repeat(99));
});

test("chat titles: a whitespace-only question has no title and counts as blank", () => {
  // Includes U+001C and NEL: not JS whitespace, but blank to the API (Python) and Postgres
  for (const blank of [" \n\t\u00a0\u3000 ", "\x1c", " \x85 "]) {
    assert.equal(chatTitle(blank), "", JSON.stringify(blank));
    assert.equal(isBlank(blank), true, JSON.stringify(blank));
  }
  assert.equal(isBlank("\u200b?"), false);
  assert.equal(chatTitle("Revenue\x85growth"), "Revenue growth");
});

test("chat titles: an emoji at the clipping boundary is never split", () => {
  for (const prefix of [98, 99, 100]) {
    const title = chatTitle(`${"a".repeat(prefix)}😀😀 tail`);
    assert.equal(Array.from(title).length <= 100, true, String(prefix));
    assert.equal(loneSurrogate.test(title), false, `lone surrogate at prefix ${prefix}`);
  }
  assert.equal(chatTitle(`${"a".repeat(99)}😀😀`), `${"a".repeat(99)}😀`); // kept whole: 101 UTF-16 units
});
