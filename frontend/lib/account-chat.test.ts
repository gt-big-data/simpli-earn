import assert from "node:assert/strict";
import { test } from "node:test";

import { chatForAccount, startChat, updateMessages, type AccountChat } from "./account-chat.ts";
import type { ChatMessage } from "./chat-history.ts";

const INITIAL: ChatMessage[] = [{ id: 1, sender: "bot", text: "Hi" }];
const say = (id: number, text: string) => (messages: ChatMessage[]) => [...messages, { id, sender: "user", text }];

/** Simulate renders: the dashboard calls chatForAccount with the signed-in account each render. */
function render(chat: AccountChat, accountId: string | null) {
  return chatForAccount(chat, accountId, INITIAL);
}

test("signing out and back into the same account does not bring the old chat back", () => {
  let chat = startChat("alice", INITIAL);
  chat = updateMessages(chat, chat.epoch, say(2, "alice's question"));
  chat = render(chat, null); // signed out
  chat = render(chat, "alice"); // same account again, without sending anything
  assert.deepEqual(chat.messages, INITIAL);
});

test("switching users starts a fresh chat", () => {
  let chat = startChat("alice", INITIAL);
  chat = updateMessages(chat, chat.epoch, say(2, "secret"));
  chat = render(chat, "bob");
  assert.deepEqual(chat.messages, INITIAL);
  assert.equal(chat.accountId, "bob");
});

test("a reply to a question asked before an account change is dropped", () => {
  let chat = startChat("alice", INITIAL);
  const askedIn = chat.epoch;
  chat = updateMessages(chat, askedIn, say(2, "alice asks"));
  chat = render(render(chat, null), "alice"); // out and back in while the request is in flight
  chat = updateMessages(chat, chat.epoch, say(3, "alice asks again"));
  chat = updateMessages(chat, askedIn, say(4, "late reply to the first question"));
  assert.deepEqual(chat.messages.map((m) => m.text), ["Hi", "alice asks again"]);
});

test("same account across renders keeps the chat and its identity", () => {
  let chat = startChat("alice", INITIAL);
  chat = updateMessages(chat, chat.epoch, say(2, "q"));
  assert.equal(render(chat, "alice"), chat);
});
