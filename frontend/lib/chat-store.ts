import type { SupabaseClient } from "@supabase/supabase-js";
import { clipText, type ChatMessage } from "./chat-history.ts";
import type { ChatSource } from "./chat-source.ts";

export type ChatSession = {
  id: string; user_id: string; dashboard_key: string; dashboard_id: string | null;
  video_identifier: string | null; title: string; created_at: string; updated_at: string;
};
export type MessageRow = {
  id: string; session_id: string; request_id: string; role: "user" | "assistant"; content: string;
  sources: NonNullable<ChatMessage["sources"]>; suggestions: string[];
  provider: string | null; model: string | null; created_at: string;
};
export interface ChatRepository {
  sessions(): Promise<ChatSession[]>;
  messages(id: string): Promise<ChatMessage[]>;
  create(title: string): Promise<ChatSession>;
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

export function createChatRepository(client: SupabaseClient, accountId: string, source: ChatSource): ChatRepository {
  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  return {
    async sessions() {
      return allPages<ChatSession>(async (from, to) => {
        const { data, error } = await client.from("chat_sessions").select("*")
          .eq("user_id", accountId).eq("dashboard_key", source.key)
          .order("updated_at", { ascending: false }).order("id").range(from, to);
        check(error); return data ?? [];
      });
    },
    async messages(id) {
      const rows = await allPages<MessageRow>(async (from, to) => {
        const { data, error } = await client.from("chat_messages").select("*").eq("session_id", id)
          .order("created_at").order("id").range(from, to);
        check(error); return data ?? [];
      });
      return messagesFromRows(rows, source.key);
    },
    async create(title) {
      const { data, error } = await client.from("chat_sessions").insert({
        user_id: accountId, dashboard_key: source.key, dashboard_id: source.id,
        video_identifier: source.videoId, title: clipText(title.trim(), 100),
      }).select().single();
      check(error); return data as ChatSession;
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
