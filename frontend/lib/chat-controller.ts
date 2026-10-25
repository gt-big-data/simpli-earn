import { chatBody, clipText, historyFor, MAX_QUESTION_CHARS, nextMessageId, type ChatMessage } from "./chat-history.ts";
import type { ChatSource } from "./chat-source.ts";
import type { ChatRepository, ChatSession } from "./chat-store.ts";

export const GREETING: ChatMessage = {
  id: "greeting", sender: "bot",
  text: "Hi, I'm SimpliBot! Feel free to ask me any questions about the given earnings call!",
};
export type ChatState = {
  sessions: ChatSession[]; sessionId: string | null; messages: ChatMessage[];
  loading: boolean; busy: boolean; pendingRequestId: string | null; error: string | null;
  loadFailed: boolean;
};
export type ChatResult = {
  response: string; suggestions?: string[]; sources?: ChatMessage["sources"];
  provider?: string | null; model?: string | null; session_id?: string; request_id?: string;
  user_message_id?: string; assistant_message_id?: string;
};
type Send = (body: string, token?: string) => Promise<ChatResult>;

/** One controller per auth/dashboard lifetime, independent of the docked/fullscreen panel. */
export class ChatController {
  readonly identity = nextMessageId();
  private state: ChatState;
  private listeners = new Set<() => void>();
  private selection = 0;
  private read = 0;
  private listRevision = 0;
  private disposed = false;
  private pending = new Map<string, string>();
  readonly source: ChatSource;
  private repo: ChatRepository | null;
  private send: Send;
  constructor(source: ChatSource, repo: ChatRepository | null, send: Send) {
    this.source = source; this.repo = repo; this.send = send;
    this.state = { sessions: [], sessionId: null, messages: [GREETING], loading: !!repo,
      busy: false, pendingRequestId: null, error: null, loadFailed: false };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(update: Partial<ChatState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }
  dispose() { this.disposed = true; this.read++; this.selection++; this.listRevision++; }
  activate() { this.disposed = false; }

  async initialize() {
    if (!this.repo) return;
    const read = ++this.read;
    const listRevision = ++this.listRevision;
    const selection = this.selection;
    try {
      const sessions = await this.repo.sessions();
      if (read !== this.read || listRevision !== this.listRevision || selection !== this.selection || this.disposed) return;
      this.set({ sessions });
      if (sessions.length) await this.select(sessions[0].id);
      else this.set({ loading: false, error: null, loadFailed: false });
    } catch (error) {
      if (read === this.read && listRevision === this.listRevision && selection === this.selection) this.set({ loading: false, loadFailed: true, error: errorText(error) });
    }
  }
  newChat() {
    this.selection++; this.read++;
    this.set({ sessionId: null, messages: [GREETING], busy: false, pendingRequestId: null, loading: false, error: null, loadFailed: false });
  }
  async select(id: string) {
    if (!this.repo) return;
    const selection = ++this.selection;
    const read = ++this.read;
    this.set({ sessionId: id, messages: [GREETING], loading: true, busy: this.pending.has(id), pendingRequestId: this.pending.get(id) ?? null, error: null });
    try {
      const messages = await this.repo.messages(id);
      if (read === this.read && selection === this.selection) this.set({ messages: mergeMessages(messages, this.state.messages), loading: false, loadFailed: false });
    } catch (error) {
      if (read === this.read && selection === this.selection) this.set({ loading: false, loadFailed: true, error: errorText(error) });
    }
  }
  async refresh() {
    if (!this.repo || this.state.busy || this.state.loading) return;
    if (!this.state.sessionId && !this.state.sessions.length) return this.initialize();
    const selection = this.selection;
    const read = ++this.read;
    const id = this.state.sessionId;
    const listRevision = ++this.listRevision;
    try {
      const sessions = await this.repo.sessions();
      const messages = id && sessions.some(s => s.id === id) ? await this.repo.messages(id) : null;
      if (read !== this.read || listRevision !== this.listRevision || selection !== this.selection || this.disposed || this.state.busy) return;
      this.set({ sessions, error: null, loadFailed: false });
      if (id && messages) {
        this.set({ messages: mergeMessages(messages, this.state.messages), loading: false });
      } else if (id) {
        if (sessions.length) await this.select(sessions[0].id); else this.newChat();
      }
    } catch (error) {
      if (read === this.read && listRevision === this.listRevision && selection === this.selection) this.set({ error: errorText(error) });
    }
  }
  async rename(id: string, title: string) {
    if (!this.repo || !title.trim()) return;
    this.listRevision++;
    try {
      await this.repo.rename(id, title);
      this.listRevision++;
      this.set({ sessions: this.state.sessions.map(s => s.id === id ? { ...s, title: clipText(title.trim(), 100) } : s) });
      await this.refresh();
    }
    catch (error) { this.set({ error: errorText(error) }); }
  }
  async remove(id: string) {
    if (!this.repo) return;
    this.listRevision++;
    try {
      await this.repo.remove(id);
      if (this.disposed) return;
      this.listRevision++;
      const sessions = this.state.sessions.filter(s => s.id !== id);
      this.set({ sessions });
      if (this.state.sessionId === id) {
        if (sessions.length) await this.select(sessions[0].id); else this.newChat();
      }
    } catch (error) { this.set({ error: errorText(error) }); }
  }
  async ask(text: string, retryRequestId?: string) {
    if (this.state.busy || this.state.loading || this.state.loadFailed || !text.trim() || this.disposed) return;
    text = clipText(text, MAX_QUESTION_CHARS);
    const selection = this.selection;
    const requestId = retryRequestId ?? nextMessageId();
    const before = this.state.messages;
    const existing = before.find(m => m.sender === "user" && m.requestId === requestId);
    const question: ChatMessage = existing ?? { id: nextMessageId(), requestId, sender: "user", text,
      sessionId: this.state.sessionId ?? undefined, source: this.source.key };
    let sessionId = this.state.sessionId;
    if (sessionId) this.pending.set(sessionId, requestId);
    this.read++; // Invalidate a focus refresh already in flight.
    this.set({ busy: true, pendingRequestId: requestId, error: null,
      messages: existing ? before.map(m => m === existing ? { ...m, error: undefined } : m) : [...before, question] });
    try {
      let token: string | undefined;
      if (this.repo) {
        token = await this.repo.token();
        if (this.disposed) return;
        if (!sessionId) {
          this.listRevision++;
          const session = await this.repo.create(text);
          sessionId = session.id;
          if (this.disposed) return;
          this.listRevision++;
          this.set({ sessions: [session, ...this.state.sessions] });
          if (selection === this.selection) this.set({ sessionId,
            messages: this.state.messages.map(m => m.requestId === requestId ? { ...m, sessionId: session.id } : m) });
        }
      }
      // A retry gets only turns preceding its original question, never its own/later answer.
      const index = before.findIndex(m => m.sender === "user" && m.requestId === requestId);
      const context = index < 0 ? before : before.slice(0, index);
      const body = chatBody({ message: text, id: this.source.id, video_url: this.source.video_url,
        history: historyFor(context, this.source.key),
        ...(sessionId ? { session_id: sessionId, request_id: requestId } : {}) });
      if (sessionId) this.pending.set(sessionId, requestId);
      const result = await this.send(body, token);
      if (!result.response?.trim()) throw new Error("The server returned no answer. Retry this question.");
      if (this.repo && (result.session_id !== sessionId || result.request_id !== requestId ||
        !result.user_message_id || !result.assistant_message_id)) {
        throw new Error("The backend did not confirm saving this answer. Deploy the chat-history backend, then refresh and retry.");
      }
      if ((sessionId ? this.state.sessionId === sessionId : selection === this.selection) && !this.disposed) {
        const answer: ChatMessage = { id: result.assistant_message_id ?? nextMessageId(), requestId,
          sessionId: sessionId ?? undefined, sender: "bot", text: result.response, source: this.source.key,
          replyTo: result.user_message_id ?? question.id, suggestions: result.suggestions ?? [],
          sources: result.sources ?? [], provider: result.provider, model: result.model };
        const messages = this.state.messages.some(m => m.sender === "user" && m.requestId === requestId)
          ? this.state.messages : [...this.state.messages, question];
        this.set({ messages: mergeMessages([...messages.filter(m => !(m.sender === "bot" && m.requestId === requestId))
          .map(m => m.sender === "user" && m.requestId === requestId ? {
            ...m, id: result.user_message_id ?? m.id, sessionId: sessionId ?? undefined, error: undefined,
          } : m), answer], []) });
      }
      if (this.repo && !this.disposed) {
        const listRevision = ++this.listRevision;
        try {
          const sessions = await this.repo.sessions();
          if (listRevision === this.listRevision) this.set({ sessions });
        } catch (error) {
          // The answer is already saved; a list-refresh error must not mark its question failed.
          if (listRevision === this.listRevision) this.set({ error: errorText(error) });
        }
      }
    } catch (error) {
      if (sessionId ? this.state.sessionId === sessionId : selection === this.selection) this.set({ error: errorText(error), messages: this.state.messages.map(m =>
        m.sender === "user" && m.requestId === requestId ? { ...m, error: errorText(error) } : m) });
    } finally {
      if (sessionId && this.pending.get(sessionId) === requestId) this.pending.delete(sessionId);
      if (sessionId ? this.state.sessionId === sessionId : selection === this.selection) this.set({ busy: false, pendingRequestId: null });
    }
  }
}

function mergeMessages(remote: ChatMessage[], local: ChatMessage[]) {
  const key = (m: ChatMessage) => m.requestId ? `${m.sender}:${m.requestId}` : m.id;
  const messages = new Map(remote.filter(m => m.id !== GREETING.id).map(m => [key(m), m]));
  for (const m of local) if (m.id !== GREETING.id && !messages.has(key(m))) messages.set(key(m), m);
  const values = [...messages.values()];
  return [GREETING, ...values.filter(m => m.sender === "user").flatMap(question => [question,
    ...values.filter(m => m.sender === "bot" && m.requestId === question.requestId)])];
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Chat unavailable. Refresh and retry.";
}
