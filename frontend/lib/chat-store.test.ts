import assert from "node:assert/strict";
import { test } from "node:test";
import { allPages, messagesFromRows, type MessageRow } from "./chat-store.ts";
import { chatSource } from "./chat-source.ts";
import { historyFor, MAX_BODY_BYTES, chatBody, clipText } from "./chat-history.ts";
import { readFileSync } from "node:fs";

test("all preloaded catalog entries get distinct bundled and normalized YouTube keys", () => {
  const catalog = JSON.parse(readFileSync(new URL("./preloaded_videos.json", import.meta.url), "utf8")) as Record<string, { url: string }>;
  for (const [id, video] of Object.entries(catalog)) {
    const bundled = chatSource(id, null);
    const youtube = chatSource(null, video.url);
    assert.equal(bundled.key, `preloaded:${id}`);
    assert.notEqual(bundled.key, youtube.key);
    for (const url of [video.url + "&t=30", `https://youtu.be/${youtube.videoId}?si=x`,
      `https://www.youtube.com/embed/${youtube.videoId}`, `https://youtube.com/live/${youtube.videoId}`,
      `https://m.youtube.com/shorts/${youtube.videoId}`]) {
      assert.deepEqual(chatSource(null, url), youtube);
    }
  }
  assert.equal(chatSource(null, null).id, "1");
  assert.equal(chatSource("aapl_2024Q4", null).key, "preloaded:aapl_2024Q4");
});

test("bad URLs and lookalike YouTube hosts are rejected", () => {
  for (const url of ["invalid", "https://youtube.com.attacker.example/watch?v=5EVhGtYa1B0",
    "javascript:alert(1)", "https://youtu.be/../bad", "https://youtube.com/watch?v=short"]) {
    assert.throws(() => chatSource(null, url));
  }
});

test("pagination continues even when the server returns fewer rows than requested", async () => {
  const input = Array.from({ length: 1003 }, (_, id) => id);
  const actual = await allPages(async from => input.slice(from, from + 37));
  assert.deepEqual(actual, input);
});

test("saved metadata round-trips and overlapping replies pair by request ID", () => {
  const row = (id: string, request: string, role: "user" | "assistant", content: string): MessageRow => ({
    id, request_id: request, role, content, session_id: "s1", provider: "gemini", model: "model",
    created_at: "2026-10-25T12:00:00Z", suggestions: ["Margins?"],
    sources: [{ chunk: 3, source: "t.txt", text: "original excerpt" }],
  });
  const messages = messagesFromRows([row("u1", "r1", "user", "q1"), row("u2", "r2", "user", "q2"),
    row("a2", "r2", "assistant", "a2"), row("a1", "r1", "assistant", "a1"), row("u3", "r3", "user", "unfinished")], "preloaded:1");
  assert.deepEqual(messages.map(m => m.id), ["u1", "a1", "u2", "a2", "u3"]);
  assert.deepEqual(messages[1].sources, [{ chunk: 3, source: "t.txt", text: "original excerpt" }]);
  assert.equal(messages[1].model, "model");
  assert.deepEqual(historyFor(messages, "preloaded:1", "s1"), [{ question: "q1", answer: "a1" }, { question: "q2", answer: "a2" }]);
  assert.deepEqual(historyFor(messages, "preloaded:1", "another-session"), []);
});

test("context byte cap includes JSON escaping and preserves original history", () => {
  const history = Array.from({ length: 20 }, () => ({ question: "\u0000".repeat(2000), answer: "\u0001".repeat(8000) }));
  const body = chatBody({ message: "hello", history });
  assert.ok(new TextEncoder().encode(body).byteLength <= MAX_BODY_BYTES);
  assert.ok(JSON.parse(body).history.length < 20);
  assert.equal(history.length, 20);
  const emoji = clipText("😀".repeat(8001), 8000);
  assert.equal(Array.from(emoji).length, 8000);
  assert.equal(emoji.at(-1)?.charCodeAt(0), 0xde00);
});
