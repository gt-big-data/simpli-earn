import Fuse from "fuse.js";
import type { ChatSession } from "./chat-store.ts";

export type SearchBy = "chat" | "ticker";
export type SortKey = "updated" | "created" | "length" | "ticker" | "title";
export type SortDir = "asc" | "desc";
/**
 * The "All chats" view: a fuzzy query over chat titles or tickers, a hard ticker filter, and
 * sorts. `sorts` are the checked sort keys in the order they were checked (the first one groups
 * the list); `dirs` keeps every key's direction, checked or not.
 */
export type ChatSearch = {
  query: string; by: SearchBy; tickers: string[]; sorts: SortKey[]; dirs: Record<SortKey, SortDir>;
};
export const NO_SEARCH: ChatSearch = { query: "", by: "chat", tickers: [], sorts: [],
  dirs: { updated: "desc", created: "desc", length: "desc", ticker: "asc", title: "asc" } };

type LabelOf = (s: ChatSession) => string;

/**
 * Each dashboard tag among `sessions` with its chat count, A–Z. A checked tag with no chats left
 * stays listed (count 0) so it can still be unchecked.
 */
export function tickerCounts(sessions: ChatSession[], labelOf: LabelOf, checked: string[]) {
  const counts = new Map(checked.map(ticker => [ticker, 0]));
  for (const session of sessions) counts.set(labelOf(session), (counts.get(labelOf(session)) ?? 0) + 1);
  return [...counts].map(([ticker, count]) => ({ ticker, count })).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/**
 * The chats to list: checked tickers narrow the list first (any of them), then a query ranks what
 * is left by match relevance, typos and partial words included. With no query, the given order
 * (newest first) is kept.
 */
export function searchChats(sessions: ChatSession[], labelOf: LabelOf, search: ChatSearch) {
  const checked = new Set(search.tickers);
  const pool = checked.size ? sessions.filter(s => checked.has(labelOf(s))) : sessions;
  const query = search.query.trim();
  if (!query) return pool;
  const items = pool.map(session => ({ session, title: session.title, ticker: labelOf(session) }));
  // ignoreLocation: a match late in a long title counts the same as one at the start
  const fuse = new Fuse(items, { keys: [search.by === "ticker" ? "ticker" : "title"], threshold: 0.4, ignoreLocation: true });
  return fuse.search(query).map(result => result.item.session);
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const time = (iso: string) => Date.parse(iso) || 0;
const count = (s: ChatSession) => s.message_count ?? 0;
// First letter without accents (É files under E, as localeCompare sorts it); "#" for anything else
const initial = (title: string) => /^\p{L}/u.test(title.trim()) ? title.trim().normalize("NFD")[0].toLocaleUpperCase() : "#";
/** Each sort: how two chats compare (ascending), and the heading of the group a chat falls in. */
const SORTS: Record<SortKey, { compare: (a: ChatSession, b: ChatSession, labelOf: LabelOf) => number;
  group: (s: ChatSession, labelOf: LabelOf) => string }> = {
  updated: { compare: (a, b) => time(a.updated_at) - time(b.updated_at), group: s => day(s.updated_at) },
  created: { compare: (a, b) => time(a.created_at) - time(b.created_at), group: s => day(s.created_at) },
  length: { compare: (a, b) => count(a) - count(b), group: s => `${count(s)} message${count(s) === 1 ? "" : "s"}` },
  ticker: { compare: (a, b, labelOf) => labelOf(a).localeCompare(labelOf(b)), group: (s, labelOf) => labelOf(s) },
  title: { compare: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }), group: s => initial(s.title) },
};

/**
 * `sessions` (already filtered and ranked) in display groups. With no sort checked: one untitled
 * group in the given order. Otherwise sorted by each checked key in turn, ties keeping the given
 * order, and split into headed groups by the first key (a day, a ticker, a message count, a letter).
 */
export function groupChats(sessions: ChatSession[], labelOf: LabelOf, search: ChatSearch) {
  if (!search.sorts.length) return [{ title: null, sessions }];
  const sorted = [...sessions].sort((a, b) => {
    for (const key of search.sorts) {
      const order = SORTS[key].compare(a, b, labelOf) * (search.dirs[key] === "asc" ? 1 : -1);
      if (order) return order;
    }
    return 0;
  });
  const groups: { title: string | null; sessions: ChatSession[] }[] = [];
  for (const session of sorted) {
    const title = SORTS[search.sorts[0]].group(session, labelOf);
    if (groups.at(-1)?.title === title) groups.at(-1)!.sessions.push(session);
    else groups.push({ title, sessions: [session] });
  }
  return groups;
}
