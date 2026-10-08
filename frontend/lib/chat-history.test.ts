// Run with `npm test` (Node 22.18+ runs TypeScript directly; no test framework needed).
import assert from "node:assert/strict";
import { test } from "node:test";

import { historyFor, MAX_ANSWER_CHARS, MAX_HISTORY_TURNS, nextMessageId, type ChatMessage } from "./chat-history.ts";

const SRC = "1|";
const user = (id: number, text: string, source = SRC): ChatMessage => ({ id, sender: "user", text, source });
const bot = (id: number, replyTo: number, text: string, source = SRC): ChatMessage =>
  ({ id, sender: "bot", text, source, replyTo });
const greeting: ChatMessage = { id: 1, sender: "bot", text: "Hi, I'm SimpliBot!" };

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
  assert.ok(!ids.has(1));
});
