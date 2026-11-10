"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { ChatController, ChatState } from "@/lib/chat-controller";
import type { ChatSession } from "@/lib/chat-store";
import { chatHref, dashboardLabel, dashboardTicker, everyChat, normalizeTicker } from "@/lib/dashboards";
import { groupChats, NO_SEARCH, searchChats, tickerCounts, type ChatSearch } from "@/lib/chat-search";
import { useCustomTickers } from "@/lib/use-custom-tickers";
import ChatHistorySearch from "./ChatHistorySearch";
import Segmented, { tabId } from "./Segmented";

/** Which chats the history shows: this dashboard's, or every dashboard's narrowed by `search` */
export type HistoryView = { scope: "call" | "all"; search: ChatSearch };
export const DEFAULT_HISTORY_VIEW: HistoryView = { scope: "call", search: NO_SEARCH };

export default function ChatHistoryList({ controller, state, view, onViewChange, onSelect }: {
  controller: ChatController; state: ChatState; view: HistoryView; onViewChange: (view: HistoryView) => void;
  onSelect?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const urlTicker = useSearchParams().get("ticker");
  const customTickers = useCustomTickers();
  const key = controller.source.key;
  // Both the sidebar and the small-screen popover can be mounted at once, so ids must be per instance
  const tabsId = useId();
  const panelId = useId();
  const { scope, search } = view;
  // Typing re-ranks after a short pause; clearing applies at once
  const [debouncedQuery, setDebouncedQuery] = useState(search.query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(search.query), 150);
    return () => clearTimeout(timer);
  }, [search.query]);

  // Re-read the other dashboards' chats whenever "All chats" is shown (or this dashboard changes)
  useEffect(() => { if (scope === "all") void controller.loadAll(); }, [scope, controller]);

  // A ticker typed into a custom link wins over the detected one, as on the charts
  const current = { dashboard_id: controller.source.id, video_identifier: controller.source.videoId };
  const currentTicker = normalizeTicker(urlTicker) ?? dashboardTicker(current, customTickers);
  const tickerOf = (session: ChatSession) =>
    session.dashboard_key === key ? currentTicker : dashboardTicker(session, customTickers);

  const all = scope === "all";
  const labelOf = (session: ChatSession) => dashboardLabel(session, tickerOf(session));
  const listed = all ? everyChat(state.sessions, state.allSessions ?? [], key) : state.sessions;
  const searching = all && (!!search.query.trim() || search.tickers.length > 0);
  const sessions = all ? searchChats(listed, labelOf, { ...search, query: search.query.trim() ? debouncedQuery : "" }) : listed;
  const groups = all ? groupChats(sessions, labelOf, search) : [{ title: null, sessions }];
  // Only the first list load shows a placeholder; opening a chat must not shift the list
  const listLoading = all ? !state.allSessions : state.loading && !state.sessions.length;

  const open = (session: ChatSession) => {
    if (session.dashboard_key !== key) router.push(chatHref(session, tickerOf(session)));
    else if (state.sessionId !== session.id) void controller.select(session.id);
    onSelect?.();
  };

  return (
    <nav aria-label="Chat history" className="flex h-full min-h-0 flex-col gap-3 text-sm">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button type="button" className="flex cursor-pointer items-center gap-2 text-brand"
          onClick={() => { controller.newChat(); onSelect?.(); }}><Plus className="size-4" />New chat</button>
        <button type="button" aria-label="Refresh chat history" disabled={state.busy || state.loading}
          className="cursor-pointer disabled:opacity-40" onClick={() => void controller.refresh()}><RefreshCw className="size-3.5" /></button>
      </div>
      <Segmented label="Show chats from" value={scope} onChange={value => onViewChange({ ...view, scope: value })}
        tabs={{ id: tabsId, panelId }}
        options={[{ value: "call", label: `${dashboardLabel(current, currentTicker)} chats` }, { value: "all", label: "All chats" }]} />
      {/* The selected tab's chats: the search row (All chats only) and the scrolling list */}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tabsId, scope)} className="flex min-h-0 flex-1 flex-col gap-3">
        {all && <ChatHistorySearch search={search} onChange={next => onViewChange({ ...view, search: next })}
          tickers={tickerCounts(listed, labelOf, search.tickers)} />}
        <div className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-auto">
          {listLoading && <p className="text-xs text-muted-foreground">Loading history…</p>}
          {!listLoading && !listed.length && <p className="text-xs text-muted-foreground">
            {all ? "No saved chats yet." : "No saved chats for this call."} Send a message to start one.</p>}
          {!listLoading && listed.length > 0 && !sessions.length && searching && <div className="text-xs text-muted-foreground" role="status">
            <p>{search.query.trim() ? `No chats match “${search.query.trim()}”${search.tickers.length ? " in the selected tickers" : ""}.`
              : "No chats for the selected tickers."}</p>
            <button type="button" className="mt-2 cursor-pointer text-brand" onClick={() => onViewChange({ ...view, search: { ...search, query: "", tickers: [] } })}>
              Clear search and filters</button>
          </div>}
          {/* Sorted lists come in headed groups (a day, a ticker…); unsorted is one group without a heading */}
          {!listLoading && groups.map(group => (
            <section key={group.title ?? "all"} aria-label={group.title ?? undefined}>
              {group.title && <div className="mb-2">
                <h3 className="text-sm leading-none font-light text-foreground">{group.title}</h3>
                <div aria-hidden className="mt-1.5 h-px bg-white/30" />
              </div>}
              <div className="space-y-2">
                {group.sessions.map(session => (
                  <div key={session.id} className={`relative rounded-lg border p-2 transition-colors ${state.sessionId === session.id
                    ? "border-brand/50 bg-white/5" : "border-white/8 hover:bg-white/5"}`}>
                    {editing === session.id ? (
                      <form onSubmit={async e => {
                        e.preventDefault(); if (!title.trim() || saving) return;
                        setSaving(true); await controller.rename(session.id, title); setSaving(false); setEditing(null);
                      }}>
                        <input aria-label="Conversation title" autoFocus maxLength={100} value={title}
                          onChange={e => setTitle(e.target.value)} className="w-full rounded bg-black/40 p-1 text-sm" />
                        <div className="mt-2 flex gap-3 text-xs">
                          <button disabled={saving || !title.trim()} className="cursor-pointer text-brand">Save</button>
                          <button type="button" className="cursor-pointer" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        {/* The ::after overlay stretches this button across the whole card; the
                            rename/delete buttons sit above it (relative z-10) */}
                        <div className="flex items-start gap-2">
                          <button type="button" aria-current={state.sessionId === session.id ? "true" : undefined}
                            className="min-w-0 flex-1 cursor-pointer break-words text-left after:absolute after:inset-0 after:rounded-lg"
                            onClick={() => open(session)}>{session.title}</button>
                          {/* Which dashboard the chat belongs to; same look as the Summary's timestamp pills, compact */}
                          {all && <span className="shrink-0 rounded-md border border-white/8 bg-pill px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground">
                            {dashboardLabel(session, tickerOf(session))}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-muted-foreground">
                          <span className="mr-auto text-[10px]">{new Date(session.updated_at).toLocaleDateString()}</span>
                          <button type="button" aria-label={`Rename ${session.title}`} className="relative z-10 cursor-pointer hover:text-foreground"
                            onClick={() => { setEditing(session.id); setTitle(session.title); }}><Pencil className="size-3" /></button>
                          <button type="button" aria-label={`Delete ${session.title}`} className="relative z-10 cursor-pointer hover:text-foreground"
                            onClick={() => setDeleting(session.id)}><Trash2 className="size-3" /></button>
                        </div>
                      </>
                    )}
                    {deleting === session.id && (
                      <div className="relative z-10 mt-2 text-xs" role="alert">
                        <p>Delete this chat and all its messages?</p>
                        <div className="mt-2 flex gap-3">
                          <button type="button" disabled={saving} className="cursor-pointer text-red-300" onClick={async () => {
                            setSaving(true); await controller.remove(session.id); setSaving(false); setDeleting(null);
                          }}>Delete</button>
                          <button type="button" className="cursor-pointer" onClick={() => setDeleting(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </nav>
  );
}
