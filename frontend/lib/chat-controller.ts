import { chatBody, chatTitle, clipText, historyFor, isBlank, MAX_QUESTION_CHARS, nextMessageId, type ChatMessage } from "./chat-history.ts";
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
  /** Chats on every dashboard, for "All chats"; null until loadAll() first reads them. */
  allSessions: ChatSession[] | null;
};
export type ChatResult = {
  response: string; suggestions?: string[]; sources?: ChatMessage["sources"];
  provider?: string | null; model?: string | null; session_id?: string; request_id?: string;
  user_message_id?: string; assistant_message_id?: string;
  /** false: the answer was generated but breaks a storage limit; it comes back unsaved, never lost */
  saved?: boolean; not_saved_reason?: string;
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
  private allRevision = 0;
  private disposed = false;
  private pending = new Map<string, string>();
  /** New chats listed before /chat has confirmed creating them; their sends carry `title`. */
  private unsaved = new Map<string, ChatSession>();
  /** ID the draft's first send creates; kept after a failed first send, so a retry reuses it. */
  private draftId = nextMessageId();
  readonly source: ChatSource;
  private repo: ChatRepository | null;
  private send: Send;
  constructor(source: ChatSource, repo: ChatRepository | null, send: Send) {
    this.source = source; this.repo = repo; this.send = send;
    this.state = { sessions: [], sessionId: null, messages: [GREETING], loading: !!repo,
      busy: false, pendingRequestId: null, error: null, loadFailed: false, allSessions: null };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(update: Partial<ChatState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }
  dispose() { this.disposed = true; this.read++; this.selection++; this.listRevision++; this.allRevision++; }
  activate() { this.disposed = false; }

  /** Opens `preferred` when this dashboard lists it (a link from "All chats"), else the newest chat. */
  async initialize(preferred?: string | null) {
    if (!this.repo) return;
    const read = ++this.read;
    const listRevision = ++this.listRevision;
    const selection = this.selection;
    try {
      const sessions = await this.repo.sessions();
      if (read !== this.read || listRevision !== this.listRevision || selection !== this.selection || this.disposed) return;
      this.set({ sessions: this.withUnsaved(sessions) });
      const open = sessions.find(s => s.id === preferred) ?? sessions[0];
      if (open) await this.select(open.id);
      else this.set({ loading: false, error: null, loadFailed: false });
    } catch (error) {
      if (read === this.read && listRevision === this.listRevision && selection === this.selection) this.set({ loading: false, loadFailed: true, error: errorText(error) });
    }
  }
  newChat() {
    this.selection++; this.read++; this.draftId = nextMessageId();
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
    if (this.state.allSessions) void this.loadAll();
    if (!this.state.sessionId && !this.state.sessions.length) return this.initialize();
    const selection = this.selection;
    const read = ++this.read;
    const id = this.state.sessionId;
    const listRevision = ++this.listRevision;
    try {
      const sessions = await this.repo.sessions();
      const messages = id && sessions.some(s => s.id === id) ? await this.repo.messages(id) : null;
      if (read !== this.read || listRevision !== this.listRevision || selection !== this.selection || this.disposed || this.state.busy) return;
      this.set({ sessions: this.withUnsaved(sessions), error: null, loadFailed: false });
      if (id && messages) {
        this.set({ messages: mergeMessages(messages, this.state.messages), loading: false });
      } else if (id && !this.unsaved.has(id)) {
        if (sessions.length) await this.select(sessions[0].id); else this.newChat();
      }
    } catch (error) {
      if (read === this.read && listRevision === this.listRevision && selection === this.selection) this.set({ error: errorText(error) });
    }
  }
  /** Reads every dashboard's chats; refresh() keeps them current once read. */
  async loadAll() {
    if (!this.repo) return;
    const revision = ++this.allRevision;
    try {
      const allSessions = await this.repo.allSessions();
      if (revision === this.allRevision) this.set({ allSessions });
    } catch (error) {
      if (revision === this.allRevision) this.set({ error: errorText(error) });
    }
  }
  async rename(id: string, title: string) {
    if (!this.repo || !title.trim()) return;
    if (this.unsaved.has(id)) return this.set({ error: UNSAVED_EDIT });
    this.listRevision++;
    try {
      await this.repo.rename(id, title);
      this.listRevision++; this.allRevision++;
      const retitle = (s: ChatSession) => s.id === id ? { ...s, title: clipText(title.trim(), 100) } : s;
      this.set({ sessions: this.state.sessions.map(retitle), allSessions: this.state.allSessions?.map(retitle) ?? null });
      await this.refresh();
    }
    catch (error) { this.set({ error: errorText(error) }); }
  }
  async remove(id: string) {
    if (!this.repo) return;
    if (this.unsaved.has(id)) return this.set({ error: UNSAVED_EDIT });
    this.listRevision++;
    try {
      await this.repo.remove(id);
      if (this.disposed) return;
      this.listRevision++; this.allRevision++;
      const sessions = this.state.sessions.filter(s => s.id !== id);
      this.set({ sessions, allSessions: this.state.allSessions?.filter(s => s.id !== id) ?? null });
      if (this.state.sessionId === id) {
        if (sessions.length) await this.select(sessions[0].id); else this.newChat();
      }
    } catch (error) { this.set({ error: errorText(error) }); }
  }
  async ask(text: string, retryRequestId?: string) {
    if (this.state.busy || this.state.loading || this.state.loadFailed || isBlank(text) || this.disposed) return;
    text = clipText(text, MAX_QUESTION_CHARS);
    const selection = this.selection;
    const requestId = retryRequestId ?? nextMessageId();
    const before = this.state.messages;
    const existing = before.find(m => m.sender === "user" && m.requestId === requestId);
    // A new chat is listed right away, but only /chat creates it, together with this question,
    // so a send that fails before the question saves leaves no empty chat behind.
    const sessionId = this.state.sessionId ?? (this.repo ? this.draftId : null);
    const isNew = !!sessionId && !this.state.sessionId;
    if (isNew && !this.unsaved.has(sessionId)) this.unsaved.set(sessionId, this.repo!.draft(sessionId, chatTitle(text)));
    const question: ChatMessage = existing ?? { id: nextMessageId(), requestId, sender: "user", text,
      sessionId: sessionId ?? undefined, source: this.source.key };
    if (sessionId) this.pending.set(sessionId, requestId);
    this.read++; // Invalidate a focus refresh already in flight.
    this.set({ busy: true, pendingRequestId: requestId, error: null,
      ...(isNew ? { sessionId, sessions: [this.unsaved.get(sessionId)!, ...this.state.sessions.filter(s => s.id !== sessionId)] } : {}),
      messages: (existing ? before.map(m => m === existing ? { ...m, error: undefined } : m) : [...before, question])
        .map(m => isNew && m.requestId === requestId ? { ...m, sessionId } : m) });
    try {
      let token: string | undefined;
      if (this.repo) {
        token = await this.repo.token();
        if (this.disposed) return;
      }
      // A retry gets only turns preceding its original question, never its own/later answer.
      const index = before.findIndex(m => m.sender === "user" && m.requestId === requestId);
      const context = index < 0 ? before : before.slice(0, index);
      const draft = sessionId ? this.unsaved.get(sessionId) : undefined;
      const body = chatBody({ message: text, id: this.source.id, video_url: this.source.video_url,
        history: historyFor(context, this.source.key),
        ...(sessionId ? { session_id: sessionId, request_id: requestId, ...(draft ? { title: draft.title } : {}) } : {}) });
      const result = await this.send(body, token);
      if (!result.response?.trim()) throw new Error("The server returned no answer. Retry this question.");
      // Saved: both message IDs. Explicitly unsaved (saved: false): the question's ID only.
      const unsavedAnswer = result.saved === false;
      if (this.repo && (result.session_id !== sessionId || result.request_id !== requestId ||
        !result.user_message_id || (!unsavedAnswer && !result.assistant_message_id))) {
        throw new Error("The backend did not confirm saving this answer. Deploy the chat-history backend, then refresh and retry.");
      }
      if (sessionId) this.unsaved.delete(sessionId);
      if (this.viewing(sessionId, selection) && !this.disposed) {
        const answer: ChatMessage = { id: result.assistant_message_id ?? nextMessageId(), requestId,
          sessionId: sessionId ?? undefined, sender: "bot", text: result.response, source: this.source.key,
          replyTo: result.user_message_id ?? question.id, suggestions: result.suggestions ?? [],
          sources: result.sources ?? [], provider: result.provider, model: result.model,
          ...(unsavedAnswer ? { notSaved: result.not_saved_reason || "This answer couldn't be saved to your history." } : {}) };
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
          if (listRevision === this.listRevision) this.set({ sessions: this.withUnsaved(sessions) });
        } catch (error) {
          // The answer is already saved; a list-refresh error must not mark its question failed.
          if (listRevision === this.listRevision) this.set({ error: errorText(error) });
        }
      }
    } catch (error) {
      if (sessionId && this.unsaved.has(sessionId)) await this.settleUnsaved(sessionId);
      if (this.viewing(sessionId, selection)) this.set({ error: errorText(error), messages: this.state.messages.map(m =>
        m.sender === "user" && m.requestId === requestId ? { ...m, error: errorText(error) } : m) });
    } finally {
      if (sessionId && this.pending.get(sessionId) === requestId) this.pending.delete(sessionId);
      if (this.viewing(sessionId, selection)) this.set({ busy: false, pendingRequestId: null });
    }
  }

  /** Whether a send's chat is still on screen; a first send that created nothing is the draft again. */
  private viewing(sessionId: string | null, selection: number) {
    if (!sessionId) return selection === this.selection;
    return this.state.sessionId === sessionId || (this.state.sessionId === null && this.draftId === sessionId);
  }
  /** A list read from the server, plus new chats it doesn't have yet; a chat it lists is no longer unsaved. */
  private withUnsaved(sessions: ChatSession[]) {
    for (const session of sessions) this.unsaved.delete(session.id);
    return [...this.unsaved.values(), ...sessions.filter(s => !this.unsaved.has(s.id))];
  }
  /**
   * After a failed first send: if /chat never created the chat, unlist it and turn the view back
   * into the draft (question and error kept, same IDs for a retry). If the list can't be read,
   * whether it exists is unknown, so it stays listed and a retry sends its title again.
   */
  private async settleUnsaved(id: string) {
    const listRevision = ++this.listRevision;
    try {
      const sessions = await this.repo!.sessions();
      if (listRevision !== this.listRevision || this.disposed) return;
      const exists = sessions.some(s => s.id === id);
      if (!exists) this.unsaved.delete(id);
      this.set({ sessions: this.withUnsaved(sessions), ...(!exists && this.state.sessionId === id ? { sessionId: null } : {}) });
    } catch { /* see above */ }
  }
}

const UNSAVED_EDIT = "Wait for this chat's first answer before renaming or deleting it.";

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
