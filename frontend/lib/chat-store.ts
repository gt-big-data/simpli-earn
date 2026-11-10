import type { SupabaseClient } from "@supabase/supabase-js";
import { clipText, type ChatMessage } from "./chat-history.ts";
import type { ChatSource } from "./chat-source.ts";

export type ChatSession = {
  id: string; user_id: string; dashboard_key: string; dashboard_id: string | null;
  video_identifier: string | null; title: string; created_at: string; updated_at: string;
  /** Questions and answers saved in the chat (read with the list, for sorting by length) */
  message_count?: number;
};
export type MessageRow = {
  id: string; session_id: string; request_id: string; role: "user" | "assistant"; content: string;
  sources: NonNullable<ChatMessage["sources"]>; suggestions: string[];
  provider: string | null; model: string | null; created_at: string;
};
export interface ChatRepository {
  sessions(): Promise<ChatSession[]>;
  /** The account's chats on every dashboard. */
  allSessions(): Promise<ChatSession[]>;
  messages(id: string): Promise<ChatMessage[]>;
  /** A not-yet-saved chat for the list; /chat creates the real row with its first question. */
  draft(id: string, title: string): ChatSession;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  token(): Promise<string>;
}

/** Stable pages: never rely on the server's configured maximum row count. */
export async function allPages<T>(read: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await read(rows.length, rows.length + 199);
    rows.push(...page);
    if (page.length === 0) return rows;
  }
}

export function messagesFromRows(rows: MessageRow[], source: string): ChatMessage[] {
  const questions = new Map(rows.filter(row => row.role === "user").map(row => [row.request_id, row.id]));
  const messages = rows.map(row => ({
    id: row.id, sessionId: row.session_id, requestId: row.request_id,
    sender: row.role === "user" ? "user" : "bot", text: row.content, source,
    replyTo: row.role === "assistant" ? questions.get(row.request_id) : undefined,
    sources: row.sources, suggestions: row.suggestions, provider: row.provider, model: row.model,
    createdAt: row.created_at,
  }));
  // Keep an answer with its question even if overlapping requests completed out of order.
  return messages.filter(m => m.sender === "user").flatMap(question => [question,
    ...messages.filter(m => m.sender === "bot" && m.requestId === question.requestId)]);
}

/** A listed row with its embedded `chat_messages(count)` flattened to `message_count`. */
export function withMessageCount({ chat_messages, ...session }: ChatSession & { chat_messages?: { count: number }[] }): ChatSession {
  return { ...session, message_count: chat_messages?.[0]?.count ?? 0 };
}

export function createChatRepository(client: SupabaseClient, accountId: string, source: ChatSource): ChatRepository {
  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  const list = (dashboardKey: string | null) => allPages<ChatSession>(async (from, to) => {
    let query = client.from("chat_sessions").select("*, chat_messages(count)").eq("user_id", accountId);
    if (dashboardKey) query = query.eq("dashboard_key", dashboardKey);
    const { data, error } = await query.order("updated_at", { ascending: false }).order("id").range(from, to);
    check(error); return (data ?? []).map(withMessageCount);
  });
  return {
    sessions: () => list(source.key),
    allSessions: () => list(null),
    async messages(id) {
      const rows = await allPages<MessageRow>(async (from, to) => {
        const { data, error } = await client.from("chat_messages").select("*").eq("session_id", id)
          .order("created_at").order("id").range(from, to);
        check(error); return data ?? [];
      });
      return messagesFromRows(rows, source.key);
    },
    draft(id, title) {
      const now = new Date().toISOString();
      return { id, user_id: accountId, dashboard_key: source.key, dashboard_id: source.id,
        video_identifier: source.videoId, title, created_at: now, updated_at: now };
    },
    async rename(id, title) {
      const { data, error } = await client.from("chat_sessions").update({ title: clipText(title.trim(), 100) })
        .eq("id", id).select("id");
      check(error); if (!data?.length) throw new Error("Conversation no longer exists");
    },
    async remove(id) {
      const { data, error } = await client.from("chat_sessions").delete().eq("id", id).select("id");
      check(error); if (!data?.length) throw new Error("Conversation no longer exists");
    },
    async token() {
      const { data, error } = await client.auth.getSession();
      check(error);
      if (!data.session || data.session.user.id !== accountId) throw new Error("Your session changed. Sign in and retry.");
      return data.session.access_token;
    },
  };
}
