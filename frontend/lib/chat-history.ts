// Chat messages and the history the browser sends to the RAG API's /chat. The API keeps no chat
// state: each request carries the earlier answered turns about the same transcript.

export type ChatMessage = {
  id: number;
  sender: string;
  text: string;
  suggestions?: string[]; // Optional array of follow-up question suggestions
  source?: string; // Transcript the exchange was about (dashboard id or video URL)
  replyTo?: number; // For bot messages: id of the question this answers
};

// Must match the RAG API's request limits (RAG/api_chatbot.py), which reject anything larger
export const MAX_HISTORY_TURNS = 20;
export const MAX_QUESTION_CHARS = 2000;
export const MAX_ANSWER_CHARS = 8000;

// Ids must stay unique when questions are sent before earlier replies arrive (and across the
// docked/fullscreen remounts), so they come from a counter rather than the list length.
// The dashboard's greeting uses id 1.
let lastMessageId = 1;
export const nextMessageId = () => ++lastMessageId;

/**
 * Answered questions about `source`, in the order asked, trimmed to the API's limits. Replies are
 * matched by `replyTo`, not by position: with overlapping sends the list can read user1, user2,
 * bot1, bot2. Failed replies (starting with ⚠️) and unanswered questions are left out.
 */
export function historyFor(messages: ChatMessage[], source: string) {
  const replies = new Map<number, ChatMessage>();
  for (const message of messages) {
    if (message.sender === "bot" && message.replyTo !== undefined) replies.set(message.replyTo, message);
  }
  const turns: { question: string; answer: string }[] = [];
  for (const question of messages) {
    const answer = replies.get(question.id);
    if (
      question.sender === "user" &&
      question.source === source &&
      answer &&
      answer.source === source &&
      !answer.text.startsWith("⚠️")
    ) {
      turns.push({
        question: question.text.slice(0, MAX_QUESTION_CHARS),
        answer: answer.text.slice(0, MAX_ANSWER_CHARS),
      });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}
