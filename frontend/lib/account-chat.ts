import type { ChatMessage } from "./chat-history.ts";

/**
 * The dashboard chat, owned by one signed-in account (null when signed out). Every account
 * transition replaces it with a fresh chat and a new epoch, so an earlier user's messages are
 * discarded, not just hidden, and a reply to a question asked in an earlier epoch is dropped.
 */
export type AccountChat = { accountId: string | null; epoch: number; messages: ChatMessage[] };

export function startChat(accountId: string | null, initial: ChatMessage[], epoch = 0): AccountChat {
  return { accountId, epoch, messages: initial };
}

/** The chat for `accountId`: unchanged if it already owns it, otherwise a fresh one. */
export function chatForAccount(chat: AccountChat, accountId: string | null, initial: ChatMessage[]): AccountChat {
  return chat.accountId === accountId ? chat : startChat(accountId, initial, chat.epoch + 1);
}

/** Apply a messages update made during `epoch`; updates from an earlier epoch are dropped. */
export function updateMessages(
  chat: AccountChat,
  epoch: number,
  update: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])
): AccountChat {
  if (chat.epoch !== epoch) return chat;
  return { ...chat, messages: typeof update === "function" ? update(chat.messages) : update };
}
