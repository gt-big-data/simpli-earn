import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatController, type ChatResult } from "./chat-controller.ts";
import { chatSource } from "./chat-source.ts";
import type { ChatRepository, ChatSession } from "./chat-store.ts";
import type { ChatMessage } from "./chat-history.ts";
import { chatHref, dashboardLabel, dashboardTicker, everyChat, normalizeTicker, PRELOADED_DASHBOARDS } from "./dashboards.ts";
import { readFileSync } from "node:fs";

const source = chatSource("1", null);
const session = (id: string): ChatSession => ({ id, user_id: "alice", dashboard_key: source.key,
  dashboard_id: "1", video_identifier: null, title: id, created_at: "2026-10-25", updated_at: "2026-10-25" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function repository(initial = [session("s1")], others: ChatSession[] = []) {
  const db = { sessions: [...initial], others: [...others] };
  const messages = new Map<string, ChatMessage[]>();
  const repo: ChatRepository = {
    sessions: async () => db.sessions, allSessions: async () => [...db.sessions, ...db.others],
    messages: async id => messages.get(id) ?? [],
    draft: (id, title) => ({ ...session(id), title }),
    token: async () => "alice-jwt", rename: async (id, title) => {
      const retitle = (s: ChatSession) => s.id === id ? { ...s, title } : s;
      db.sessions = db.sessions.map(retitle); db.others = db.others.map(retitle);
    },
    remove: async id => { db.sessions = db.sessions.filter(s => s.id !== id); db.others = db.others.filter(s => s.id !== id); },
  };
  return { repo, messages, db };
}
function reply(body: string): ChatResult {
  const req = JSON.parse(body);
  return { response: "answer", session_id: req.session_id, request_id: req.request_id,
    user_message_id: "saved-user", assistant_message_id: "saved-answer", sources: [], suggestions: ["follow up"] };
}
/** What /chat saves: a titled first send creates its chat with the question (migration 004's chat_start). */
function save(db: { sessions: ChatSession[] }, body: string) {
  const req = JSON.parse(body);
  if (req.title && !db.sessions.some(s => s.id === req.session_id)) db.sessions = [{ ...session(req.session_id), title: req.title }, ...db.sessions];
}

test("new chat is lazy; its first send creates it on the backend, uses the JWT and needs acknowledgement", async () => {
  const { repo, db } = repository([]);
  const bodies: { session_id: string; title?: string }[] = [];
  const c = new ChatController(source, repo, async (body, token) => {
    assert.equal(token, "alice-jwt"); bodies.push(JSON.parse(body)); save(db, body); return reply(body);
  });
  await c.initialize(); c.newChat();
  assert.equal(c.snapshot().sessions.length, 0);
  await c.ask("question");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].title, "question");
  assert.equal(c.snapshot().sessionId, bodies[0].session_id);
  assert.deepEqual(c.snapshot().sessions.map(s => s.id), [bodies[0].session_id]);
  assert.deepEqual(c.snapshot().messages.map(m => m.id), ["greeting", "saved-user", "saved-answer"]);
  await c.ask("follow up"); // the chat exists now: no title, same ID
  assert.equal(bodies[1].session_id, bodies[0].session_id); assert.equal(bodies[1].title, undefined);
  const oldApi = new ChatController(source, repo, async () => ({ response: "unsaved" }));
  await oldApi.initialize(); await oldApi.ask("q");
  assert.match(oldApi.snapshot().error!, /did not confirm saving/);
  assert.equal(oldApi.snapshot().messages.filter(m => m.sender === "bot").length, 1);
});

test("reload hydrates saved turns and retries retain request ID with only preceding context", async () => {
  const { repo, messages } = repository();
  messages.set("s1", [
    { id: "u1", requestId: "r1", sender: "user", text: "prior", source: source.key },
    { id: "a1", requestId: "r1", sender: "bot", text: "prior answer", source: source.key },
    { id: "u2", requestId: "r2", sender: "user", text: "retry", source: source.key },
    { id: "u3", requestId: "r3", sender: "user", text: "later", source: source.key },
    { id: "a3", requestId: "r3", sender: "bot", text: "later answer", source: source.key },
  ]);
  const c = new ChatController(source, repo, async body => {
    const req = JSON.parse(body); assert.equal(req.request_id, "r2");
    assert.deepEqual(req.history, [{ question: "prior", answer: "prior answer" }]); return reply(body);
  });
  await c.initialize();
  assert.equal(c.snapshot().messages.length, 6);
  await c.ask("retry", "r2");
  assert.equal(c.snapshot().messages.filter(m => m.sender === "user" && m.requestId === "r2").length, 1);
  await c.rename("s1", "renamed"); assert.equal(c.snapshot().sessions[0].title, "renamed");
  await c.remove("s1"); assert.equal(c.snapshot().sessionId, null);
});

test("an old account's pending reply never changes a replacement controller", async () => {
  const pending = deferred<ChatResult>();
  const old = new ChatController(source, null, () => pending.promise);
  const sending = old.ask("Alice private question");
  old.dispose();
  const bob = new ChatController(source, null, async () => ({ response: "Bob" }));
  pending.resolve({ response: "Alice private answer" }); await sending;
  assert.notEqual(old.identity, bob.identity);
  assert.deepEqual(bob.snapshot().messages.map(m => m.id), ["greeting"]);
  assert.ok(!old.snapshot().messages.some(m => m.text === "Alice private answer"));
});

test("a signed-in account's late reply never reaches the next account's controller", async () => {
  // Bob signing in, or Alice signing out and back in: each account change builds a new controller
  for (const [nextAccount, nextSessions] of [["bob", [session("bob-s1")]], ["alice", [session("s1")]]] as const) {
    const pending = deferred<ChatResult>(); let body = "";
    const alice = new ChatController(source, repository().repo, async b => { body = b; return pending.promise; });
    await alice.initialize();
    const sending = alice.ask("Alice private question");
    for (let i = 0; i < 10 && !body; i++) await Promise.resolve();
    assert.ok(body, "the request was sent before the account changed");
    alice.dispose();
    const next = new ChatController(source, repository([...nextSessions]).repo, async b => reply(b));
    await next.initialize();
    pending.resolve(reply(body)); await sending;
    assert.equal(next.snapshot().sessionId, nextSessions[0].id, nextAccount);
    assert.deepEqual(next.snapshot().messages.map(m => m.id), ["greeting"], nextAccount);
    assert.equal(next.snapshot().busy, false, nextAccount);
    assert.ok(!alice.snapshot().messages.some(m => m.text === "answer"), nextAccount);
  }
});

test("switching threads drops a late reply from the selected view and duplicate sends are disabled", async () => {
  const { repo } = repository([session("s1"), session("s2")]);
  const pending = deferred<ChatResult>(); let body = ""; let calls = 0;
  const c = new ChatController(source, repo, async b => { body = b; calls++; return pending.promise; });
  await c.initialize();
  const sending = c.ask("private s1"); await Promise.resolve(); await Promise.resolve();
  await c.ask("duplicate"); assert.equal(calls, 1);
  await c.select("s2"); pending.resolve(reply(body)); await sending;
  assert.equal(c.snapshot().sessionId, "s2");
  assert.deepEqual(c.snapshot().messages.map(m => m.id), ["greeting"]);
});

test("failed history load blocks send until refresh succeeds, and stale loads cannot replace new chat", async () => {
  const { repo } = repository();
  let broken = true; let sends = 0;
  repo.sessions = async () => { if (broken) throw new Error("load failed"); return [session("s1")]; };
  const c = new ChatController(source, repo, async body => { sends++; return reply(body); });
  await c.initialize(); await c.ask("do not silently create a chat");
  assert.equal(sends, 0); assert.equal(c.snapshot().loadFailed, true);
  broken = false; await c.refresh(); assert.equal(c.snapshot().loadFailed, false);
  const load = deferred<ChatMessage[]>(); repo.messages = () => load.promise;
  const selecting = c.select("s1"); c.newChat(); load.resolve([{ id: "old", sender: "user", text: "stale" }]);
  await selecting; assert.deepEqual(c.snapshot().messages.map(m => m.id), ["greeting"]);
});

test("failed response leaves a retryable question, and guest chat never touches storage", async () => {
  const c = new ChatController(source, null, async () => { throw new Error("offline"); });
  await c.ask("q");
  const question = c.snapshot().messages[1];
  assert.equal(question.error, "offline"); assert.equal(c.snapshot().busy, false);
  assert.equal(c.snapshot().sessionId, null);
  assert.equal(c.snapshot().messages.length, 2);
});

test("a stale post-answer session list cannot resurrect a deleted conversation", async () => {
  const { repo } = repository();
  const list = deferred<ChatSession[]>();
  const c = new ChatController(source, repo, async body => reply(body));
  await c.initialize();
  repo.sessions = () => list.promise;
  const sending = c.ask("q");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.snapshot().messages.at(-1)?.text, "answer");
  await c.remove("s1");
  assert.deepEqual(c.snapshot().sessions, []);
  list.resolve([session("s1")]); await sending;
  assert.deepEqual(c.snapshot().sessions, []);
  assert.equal(c.snapshot().sessionId, null);
});

test("a pending session stays busy when selected again, and its answer returns to that thread", async () => {
  const { repo } = repository([session("s1"), session("s2")]);
  const pending = deferred<ChatResult>(); let body = "";
  const c = new ChatController(source, repo, async b => { body = b; return pending.promise; });
  await c.initialize();
  const sending = c.ask("q"); await Promise.resolve(); await Promise.resolve();
  await c.select("s2"); await c.select("s1");
  assert.equal(c.snapshot().busy, true);
  pending.resolve(reply(body)); await sending;
  assert.equal(c.snapshot().busy, false);
  assert.deepEqual(c.snapshot().messages.map(m => m.id), ["greeting", "saved-user", "saved-answer"]);
});

test("a saved answer stays complete when refreshing the session list fails", async () => {
  const { repo } = repository();
  const c = new ChatController(source, repo, async body => reply(body));
  await c.initialize();
  repo.sessions = async () => { throw new Error("list unavailable"); };
  await c.ask("q");
  assert.equal(c.snapshot().messages.at(-1)?.text, "answer");
  assert.equal(c.snapshot().messages[1].error, undefined);
  assert.equal(c.snapshot().error, "list unavailable");
});

test("deleting another session does not strand an in-flight message load", async () => {
  for (const failDelete of [false, true]) {
    const { repo } = repository([session("s1"), session("s2")]);
    const c = new ChatController(source, repo, async body => reply(body));
    await c.initialize();
    const messages = deferred<ChatMessage[]>(); repo.messages = () => messages.promise;
    const loading = c.select("s1");
    if (failDelete) repo.remove = async () => { throw new Error("delete failed"); };
    await c.remove("s2");
    messages.resolve([{ id: "loaded", requestId: "r", sender: "user", text: "saved" }]);
    await loading;
    assert.equal(c.snapshot().loading, false);
    assert.equal(c.snapshot().messages[1].text, "saved");
    assert.equal(c.snapshot().sessionId, "s1");
  }
});

test("rename completion invalidates a list captured while the mutation was pending", async () => {
  const { repo } = repository();
  const c = new ChatController(source, repo, async body => reply(body));
  await c.initialize();
  const rename = deferred<void>(); repo.rename = () => rename.promise;
  const changing = c.rename("s1", "new title");
  const list = deferred<ChatSession[]>(); repo.sessions = () => list.promise;
  const sending = c.ask("q");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  rename.resolve(); await changing;
  assert.equal(c.snapshot().sessions[0].title, "new title");
  list.resolve([session("s1")]); await sending;
  assert.equal(c.snapshot().sessions[0].title, "new title");
});

test("a first send that fails before its question saves leaves no chat, and the retry reuses its IDs", async () => {
  const { repo, db } = repository([]);
  const bodies: { session_id: string; request_id: string; title?: string }[] = []; let down = true;
  const c = new ChatController(source, repo, async body => {
    bodies.push(JSON.parse(body));
    if (down) throw new TypeError("Failed to fetch"); // RAG down: nothing reached /chat
    save(db, body); return reply(body);
  });
  await c.initialize();
  await c.ask("question");
  assert.deepEqual(c.snapshot().sessions, []);
  assert.equal(c.snapshot().sessionId, null);
  const question = c.snapshot().messages[1];
  assert.equal(question.error, "Failed to fetch"); assert.equal(c.snapshot().busy, false);
  down = false;
  await c.ask(question.text, question.requestId);
  assert.deepEqual(bodies.map(b => [b.session_id, b.request_id, b.title]), [
    [bodies[0].session_id, bodies[0].request_id, "question"], [bodies[0].session_id, bodies[0].request_id, "question"]]);
  assert.deepEqual(db.sessions.map(s => s.id), [bodies[0].session_id]);
  assert.equal(c.snapshot().sessionId, bodies[0].session_id);
  assert.equal(c.snapshot().messages.at(-1)?.text, "answer");
});

test("a first send that failed after its question saved keeps the chat; one that can't be checked stays listed", async () => {
  for (const listFails of [false, true]) {
    const { repo, db } = repository([]);
    const bodies: { session_id: string; title?: string }[] = []; let failing = true;
    const c = new ChatController(source, repo, async body => {
      bodies.push(JSON.parse(body)); save(db, body);
      if (failing) throw new Error("AI service unavailable; retry this question");
      return reply(body);
    });
    await c.initialize();
    if (listFails) repo.sessions = async () => { throw new Error("list unavailable"); };
    await c.ask("question");
    const id = bodies[0].session_id;
    assert.equal(c.snapshot().sessionId, id);
    assert.deepEqual(c.snapshot().sessions.map(s => s.id), [id]);
    assert.match(c.snapshot().messages[1].error!, /AI service/);
    failing = false;
    await c.ask("question", c.snapshot().messages[1].requestId);
    assert.equal(bodies[1].session_id, id);
    // Only a chat whose creation is unconfirmed resends its title; the backend ignores it if it exists
    assert.equal(bodies[1].title, listFails ? "question" : undefined);
    assert.equal(c.snapshot().messages.at(-1)?.text, "answer");
  }
});

test("a new chat stays listed while its first send is pending, through a thread switch and refresh", async () => {
  const { repo, db } = repository([session("s1")]);
  const pending = deferred<ChatResult>(); let body = "";
  const c = new ChatController(source, repo, async b => { body = b; return pending.promise; });
  await c.initialize(); c.newChat();
  const sending = c.ask("new question");
  for (let i = 0; i < 10 && !body; i++) await Promise.resolve();
  const id = JSON.parse(body).session_id;
  assert.deepEqual(c.snapshot().sessions.map(s => [s.id, s.title]), [[id, "new question"], ["s1", "s1"]]);
  await c.select("s1"); await c.refresh();
  assert.deepEqual(c.snapshot().sessions.map(s => s.id), [id, "s1"]);
  await c.remove(id); assert.match(c.snapshot().error!, /first answer/);
  save(db, body); pending.resolve(reply(body)); await sending;
  assert.deepEqual(c.snapshot().sessions.map(s => s.id), [id, "s1"]);
  assert.equal(c.snapshot().sessionId, "s1");
});

test("a whitespace-only question is never sent; a new chat's title is the normalized question", async () => {
  const { repo, db } = repository([]);
  const titles: string[] = [];
  const c = new ChatController(source, repo, async body => { titles.push(JSON.parse(body).title); save(db, body); return reply(body); });
  await c.initialize();
  await c.ask(" \n\t\u00a0 ");
  await c.ask("\x1c\x85");
  assert.equal(titles.length, 0);
  assert.deepEqual(c.snapshot().messages.map(m => m.id), ["greeting"]);
  assert.deepEqual(c.snapshot().sessions, []);
  await c.ask(`  \n What   was revenue?${" Explain in detail.".repeat(30)}  `);
  assert.equal(titles.length, 1);
  assert.match(titles[0], /^What was revenue\? Explain in detail\./);
  assert.equal(Array.from(titles[0]).length <= 100, true);
  assert.equal(titles[0], titles[0].trim());
  assert.equal(c.snapshot().sessions[0].title, titles[0]);
});

test("an answer the backend could not store is shown, marked unsaved, not dropped", async () => {
  const { repo } = repository();
  const c = new ChatController(source, repo, async body => {
    const unsaved: ChatResult = { ...reply(body), response: "very long answer", saved: false, not_saved_reason: "Too long to save." };
    delete unsaved.assistant_message_id;
    return unsaved;
  });
  await c.initialize();
  await c.ask("q");
  const [question, answer] = c.snapshot().messages.slice(1);
  assert.equal(answer.text, "very long answer");
  assert.equal(answer.notSaved, "Too long to save.");
  assert.equal(question.error, undefined);
  assert.equal(c.snapshot().error, null);
  // An old backend that neither saves nor says so is still an explicit error
  const silent = new ChatController(source, repository().repo, async body => {
    const silentReply = reply(body); delete silentReply.assistant_message_id; return silentReply;
  });
  await silent.initialize(); await silent.ask("q");
  assert.match(silent.snapshot().error!, /did not confirm saving/);
});

const elsewhere = (id: string, updated_at: string): ChatSession => ({ ...session(id), dashboard_key: "youtube:dQw4w9WgXcQ",
  dashboard_id: null, video_identifier: "dQw4w9WgXcQ", updated_at });

test("a link from All chats opens its chat; an unknown or deleted one falls back to the newest", async () => {
  const { repo } = repository([session("s1"), session("s2")]);
  const linked = new ChatController(source, repo, async body => reply(body));
  await linked.initialize("s2");
  assert.equal(linked.snapshot().sessionId, "s2");
  const stale = new ChatController(source, repo, async body => reply(body));
  await stale.initialize("gone");
  assert.equal(stale.snapshot().sessionId, "s1");
});

test("All chats: read on demand, kept current by refresh, rename and delete, merged newest first", async () => {
  const other = elsewhere("o1", "2026-10-26");
  const { repo, db } = repository([session("s1")], [other]);
  const c = new ChatController(source, repo, async body => reply(body));
  await c.initialize();
  assert.equal(c.snapshot().allSessions, null); // not read until "All chats" is shown
  await c.loadAll();
  assert.deepEqual(c.snapshot().allSessions!.map(s => s.id), ["s1", "o1"]);
  assert.deepEqual(everyChat(c.snapshot().sessions, c.snapshot().allSessions!, source.key).map(s => s.id), ["o1", "s1"]);
  await c.rename("o1", "renamed elsewhere");
  assert.equal(c.snapshot().allSessions!.find(s => s.id === "o1")!.title, "renamed elsewhere");
  assert.equal(c.snapshot().sessionId, "s1"); // renaming another dashboard's chat doesn't change this one
  db.others.push(elsewhere("o2", "2026-10-27"));
  await c.refresh(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(c.snapshot().allSessions!.some(s => s.id === "o2"));
  await c.remove("o1");
  assert.ok(!c.snapshot().allSessions!.some(s => s.id === "o1"));
  assert.equal(c.snapshot().sessionId, "s1");
});

test("All chats lists this dashboard's unsaved new chat once, from the live list", () => {
  const draft = { ...session("draft"), updated_at: "2026-10-31T00:00:00.000Z" };
  const stale = { ...session("s1"), title: "old title" };
  const merged = everyChat([draft, { ...session("s1"), title: "new title" }], [stale, elsewhere("o1", "2026-10-28")], source.key);
  assert.deepEqual(merged.map(s => s.id), ["draft", "o1", "s1"]);
  assert.equal(merged.find(s => s.id === "s1")!.title, "new title");
});

test("dashboard labels and links cover preloaded and custom calls", () => {
  const custom = elsewhere("o1", "2026-10-26");
  assert.equal(dashboardTicker(session("s1"), new Map()), "AAPL");
  assert.equal(dashboardTicker(custom, new Map()), null);
  assert.equal(dashboardTicker(custom, new Map([["dQw4w9WgXcQ", "NFLX"]])), "NFLX");
  assert.equal(chatHref(session("s1"), "AAPL"), "/dashboard?id=1&chat=s1");
  const href = new URL(chatHref(custom, "NFLX"), "http://x");
  assert.equal(chatSource(null, href.searchParams.get("video_url")).key, custom.dashboard_key);
  assert.equal(href.searchParams.get("ticker"), "NFLX");
  assert.equal(href.searchParams.get("chat"), "o1");
  assert.equal(new URL(chatHref(custom, null), "http://x").searchParams.has("ticker"), false);
});

test("every preloaded catalog dashboard has a ticker; unresolved chats get a named tag, never a blank", () => {
  const catalog = JSON.parse(readFileSync(new URL("./preloaded_videos.json", import.meta.url), "utf8")) as Record<string, unknown>;
  for (const id of Object.keys(catalog)) {
    const ref = { dashboard_id: id, video_identifier: null };
    assert.equal(dashboardLabel(ref, dashboardTicker(ref, new Map())), PRELOADED_DASHBOARDS[id]?.ticker, `dashboard ${id}`);
  }
  const video = { dashboard_id: null, video_identifier: "dQw4w9WgXcQ" };
  for (const raw of [undefined, "", "   ", "N/A", " n/a "]) {
    assert.equal(normalizeTicker(raw), null);
    assert.equal(dashboardLabel(video, dashboardTicker(video, new Map([["dQw4w9WgXcQ", raw ?? ""]]))), "Video");
  }
  assert.equal(dashboardLabel({ dashboard_id: "999", video_identifier: null }, dashboardTicker({ dashboard_id: "999", video_identifier: null }, new Map())), "Other");
  assert.equal(normalizeTicker(" nflx "), "NFLX");
});
