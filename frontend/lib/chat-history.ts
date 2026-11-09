// Chat messages and the history the browser sends to the RAG API's /chat. The API keeps no chat
// state: each request carries the earlier answered turns about the same transcript.

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  suggestions?: string[]; // Optional array of follow-up question suggestions
  source?: string; // Transcript the exchange was about (dashboard id or video URL)
  replyTo?: string;
  requestId?: string;
  sessionId?: string;
  sources?: { chunk: number; source: string; text: string }[];
  provider?: string | null;
  model?: string | null;
  createdAt?: string;
  error?: string;
  /** Set on an answer the backend generated but could not store (it breaks a storage limit). */
  notSaved?: string;
};

// Must match the RAG API's request limits (RAG/api_chatbot.py), which reject anything larger
export const MAX_HISTORY_TURNS = 20;
export const MAX_QUESTION_CHARS = 2000;
export const MAX_ANSWER_CHARS = 8000;

// UUIDs remain unique across reloads, saved conversations and optimistic messages.
export const nextMessageId = () => crypto.randomUUID();

/**
 * Answered questions about `source`, in the order asked, trimmed to the API's limits. Replies are
 * matched by `replyTo`, not by position: with overlapping sends the list can read user1, user2,
 * bot1, bot2. Failed replies (starting with ⚠️) and unanswered questions are left out.
 */
export function historyFor(messages: ChatMessage[], source: string, sessionId?: string | null) {
  const replies = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.sender === "bot" && (message.requestId || message.replyTo)) {
      if (sessionId === undefined || message.sessionId === (sessionId ?? undefined)) {
        replies.set(message.requestId ?? message.replyTo!, message);
      }
    }
  }
  const turns: { question: string; answer: string }[] = [];
  for (const question of messages) {
    const answer = replies.get(question.requestId ?? question.id);
    if (
      question.sender === "user" &&
      question.source === source &&
      (sessionId === undefined || question.sessionId === (sessionId ?? undefined)) &&
      answer &&
      answer.source === source &&
      !answer.text.startsWith("⚠️")
    ) {
      turns.push({
        question: clipText(question.text, MAX_QUESTION_CHARS),
        answer: clipText(answer.text, MAX_ANSWER_CHARS),
      });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

export const MAX_BODY_BYTES = 1024 * 1024;
/** First `limit` code points: never splits a surrogate pair (an emoji stays whole or is dropped). */
export const clipText = (text: string, limit: number) => Array.from(text).slice(0, limit).join("");

// JS whitespace plus the C0 separators and NEL, which the API (Python) and database (Postgres
// regex \S) also count as blank: a question blank to either is never sent.
const SPACE_RUNS = /[\s\x1c-\x1f\x85]+/g;
export const isBlank = (text: string) => !text.replace(SPACE_RUNS, "");

export const MAX_TITLE_CHARS = 100;
/**
 * A new chat's title from its first question: whitespace runs collapsed to single spaces, trimmed,
 * clipped to 100 code points and trimmed again, so it is never blank when the question isn't.
 */
export const chatTitle = (question: string) =>
  clipText(question.replace(SPACE_RUNS, " ").trim(), MAX_TITLE_CHARS).trim();

/** Includes JSON escapes/UTF-8 bytes, without truncating the stored/displayed conversation. */
export function chatBody(payload: Record<string, unknown> & { history: { question: string; answer: string }[] }) {
  const history = [...payload.history];
  let body = JSON.stringify({ ...payload, history });
  while (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES && history.length) {
    history.shift();
    body = JSON.stringify({ ...payload, history });
  }
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new Error("Message is too large to send");
  return body;
}
