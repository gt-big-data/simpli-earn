import assert from "node:assert/strict";
import { test } from "node:test";
import { groupChats, NO_SEARCH, searchChats, tickerCounts, type ChatSearch } from "./chat-search.ts";
import { withMessageCount, type ChatSession } from "./chat-store.ts";

const chat = (id: string, title: string, ticker: string): ChatSession => ({ id, title, user_id: "alice",
  dashboard_key: `preloaded:${ticker}`, dashboard_id: ticker, video_identifier: null, created_at: "", updated_at: "" });
// Newest first, as the list arrives
const chats = [
  chat("1", "Guidance for next quarter", "AAPL"),
  chat("2", "Any mention of buybacks or dividend changes?", "TSLA"),
  chat("3", "What drove the gross margin change this quarter?", "AAPL"),
  chat("4", "Capex plans", "GOOGL"),
  chat("5", "Free cash flow", "Video"),
];
const labelOf = (s: ChatSession) => s.dashboard_id!;
const ids = (list: ChatSession[]) => list.map(s => s.id);

test("no query and no filter keeps the newest-first order", () => {
  assert.deepEqual(ids(searchChats(chats, labelOf, NO_SEARCH)), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, query: "   " })), ["1", "2", "3", "4", "5"]);
});

test("chat search tolerates typos and partial words, best match first", () => {
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, query: "guidnace" })), ["1"]);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, query: "buyb" })), ["2"]);
  assert.equal(ids(searchChats(chats, labelOf, { ...NO_SEARCH, query: "margin" }))[0], "3");
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, query: "xyzzy plugh" })), []);
});

test("ticker search matches tags, not titles", () => {
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, by: "ticker", query: "aapl" })), ["1", "3"]);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, by: "ticker", query: "GOGL" })), ["4"]);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, by: "ticker", query: "capex" })), []);
});

test("the ticker filter is OR across checked tickers and narrows before search ranks", () => {
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, tickers: ["AAPL", "Video"] })), ["1", "3", "5"]);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, tickers: ["TSLA"], query: "quarter" })), []);
  assert.deepEqual(ids(searchChats(chats, labelOf, { ...NO_SEARCH, tickers: ["AAPL"], query: "quarter" })).sort(), ["1", "3"]);
});

test("ticker counts come from the chats, A–Z, keeping checked tickers that have none left", () => {
  assert.deepEqual(tickerCounts(chats, labelOf, []), [
    { ticker: "AAPL", count: 2 }, { ticker: "GOOGL", count: 1 }, { ticker: "TSLA", count: 1 }, { ticker: "Video", count: 1 }]);
  assert.deepEqual(tickerCounts([], labelOf, ["WMT"]), [{ ticker: "WMT", count: 0 }]);
});

// Noon UTC keeps each timestamp on the same calendar day in any test machine's time zone
const dated = (id: string, ticker: string, title: string, updated: string, created: string, message_count: number) =>
  ({ ...chat(id, title, ticker), updated_at: `${updated}T12:00:00Z`, created_at: `${created}T12:00:00Z`, message_count });
const library = [
  dated("a", "GOOGL", "Capex plans", "2026-10-31", "2026-10-01", 4),
  dated("b", "AAPL", "Évolution of margins", "2026-10-31", "2026-10-20", 10),
  dated("c", "AAPL", "buybacks", "2026-10-16", "2026-10-16", 2),
  dated("d", "CVS", "2025 outlook", "2026-10-16", "2026-09-30", 4),
];
const sorted = (patch: Partial<ChatSearch>) => groupChats(library, labelOf, { ...NO_SEARCH, ...patch })
  .map(g => [g.title, ids(g.sessions).join("")]);

test("no sort: one untitled group in the given (newest or most relevant first) order", () => {
  assert.deepEqual(sorted({}), [[null, "abcd"]]);
});

test("each sort orders both ways and heads its groups", () => {
  assert.deepEqual(sorted({ sorts: ["updated"] }), [["October 31, 2026", "ab"], ["October 16, 2026", "cd"]]);
  assert.deepEqual(sorted({ sorts: ["created"], dirs: { ...NO_SEARCH.dirs, created: "asc" } }),
    [["September 30, 2026", "d"], ["October 1, 2026", "a"], ["October 16, 2026", "c"], ["October 20, 2026", "b"]]);
  assert.deepEqual(sorted({ sorts: ["length"] }), [["10 messages", "b"], ["4 messages", "ad"], ["2 messages", "c"]]);
  assert.deepEqual(sorted({ sorts: ["ticker"] }), [["AAPL", "bc"], ["CVS", "d"], ["GOOGL", "a"]]);
  assert.deepEqual(sorted({ sorts: ["ticker"], dirs: { ...NO_SEARCH.dirs, ticker: "desc" } }), [["GOOGL", "a"], ["CVS", "d"], ["AAPL", "bc"]]);
  assert.deepEqual(sorted({ sorts: ["title"] }), [["#", "d"], ["B", "c"], ["C", "a"], ["E", "b"]]);
});

test("later checked sorts order chats within the first sort's groups", () => {
  assert.deepEqual(sorted({ sorts: ["ticker", "length"], dirs: { ...NO_SEARCH.dirs, length: "asc" } }),
    [["AAPL", "cb"], ["CVS", "d"], ["GOOGL", "a"]]);
  assert.deepEqual(sorted({ sorts: ["length", "ticker"] }), [["10 messages", "b"], ["4 messages", "da"], ["2 messages", "c"]]);
});

test("a listed row's embedded message count is flattened; a missing one counts as none", () => {
  const row = { ...chat("x", "t", "AAPL"), chat_messages: [{ count: 6 }] };
  assert.deepEqual(withMessageCount(row), { ...chat("x", "t", "AAPL"), message_count: 6 });
  assert.equal(withMessageCount(chat("y", "t", "AAPL")).message_count, 0);
});
