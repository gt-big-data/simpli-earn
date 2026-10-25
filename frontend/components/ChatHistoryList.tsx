"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { ChatController, ChatState } from "@/lib/chat-controller";

export default function ChatHistoryList({ controller, state, onSelect }: {
  controller: ChatController; state: ChatState; onSelect?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <nav aria-label="Chat history" className="flex h-full min-h-0 flex-col gap-3 text-sm">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button type="button" className="flex cursor-pointer items-center gap-2 text-brand"
          onClick={() => { controller.newChat(); onSelect?.(); }}><Plus className="size-4" />New chat</button>
        <button type="button" aria-label="Refresh chat history" disabled={state.busy || state.loading}
          className="cursor-pointer disabled:opacity-40" onClick={() => void controller.refresh()}><RefreshCw className="size-3.5" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {state.loading && <p className="text-xs text-muted-foreground">Loading history…</p>}
        {!state.loading && !state.sessions.length && <p className="text-xs text-muted-foreground">No saved chats for this call. Send a message to start one.</p>}
        {state.sessions.map(session => (
          <div key={session.id} className={`rounded-lg border p-2 ${state.sessionId === session.id ? "border-brand/50 bg-white/5" : "border-white/8"}`}>
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
                <button type="button" aria-current={state.sessionId === session.id ? "true" : undefined}
                  className="w-full cursor-pointer break-words text-left"
                  onClick={() => { void controller.select(session.id); onSelect?.(); }}>{session.title}</button>
                <div className="mt-2 flex items-center gap-3 text-muted-foreground">
                  <span className="mr-auto text-[10px]">{new Date(session.updated_at).toLocaleDateString()}</span>
                  <button type="button" aria-label={`Rename ${session.title}`} className="cursor-pointer"
                    onClick={() => { setEditing(session.id); setTitle(session.title); }}><Pencil className="size-3" /></button>
                  <button type="button" aria-label={`Delete ${session.title}`} className="cursor-pointer"
                    onClick={() => setDeleting(session.id)}><Trash2 className="size-3" /></button>
                </div>
              </>
            )}
            {deleting === session.id && (
              <div className="mt-2 text-xs" role="alert">
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
    </nav>
  );
}
