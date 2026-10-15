"use client";

import { Send } from "lucide-react";
import { Dispatch, SetStateAction, useEffect, useLayoutEffect, useRef, useState } from "react";
import Message from "./Message";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-config";
import { historyFor, MAX_QUESTION_CHARS, nextMessageId, type ChatMessage } from "@/lib/chat-history";

export type Message = ChatMessage;

export default function ChatBot({
  messages,
  setMessages,
  viewKey,
}: {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  /** Changes whenever the surrounding layout does (e.g. docked vs fullscreen) */
  viewKey?: string;
}) {
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id") || null;
  const videoUrl = searchParams.get("video_url") || null;

  const [userInput, setUserInput] = useState("");

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the input with its content; max-h caps it at 3 lines, past which it scrolls
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [userInput]);

  const source = `${dashboardId ?? ""}|${videoUrl ?? ""}`;

  const ask = async (text: string) => {
    // `messages` is the list before this question is added; unanswered questions are left out
    const history = historyFor(messages, source);
    const questionId = nextMessageId();
    setMessages((prev) => [...prev, { id: questionId, sender: "user", text, source }]);
    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          id: dashboardId,
          video_url: videoUrl,
          history,
        }),
      });

      const data = await res.json();
      const botMessage: Message = {
        id: nextMessageId(),
        sender: "bot", // Explicitly set to "bot"
        text: data.response || "⚠️ No response from server.",
        suggestions: data.suggestions || [], // Include suggestions from API
        source,
        replyTo: questionId,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: nextMessageId(),
        sender: "bot", // Explicitly set to "bot"
        text: "⚠️ Failed to connect to server. Check API is running.",
        replyTo: questionId,
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error("Error sending message:", error);
    }
  };

  const sendMessage = async () => {
    if (userInput.trim()) {
      setUserInput("");
      await ask(userInput);
    }
  };

  // A layout change resizes the message list, which would keep a stale scroll offset; always
  // jump to the latest message instead, before paint so it lands before any view animation
  useLayoutEffect(() => {
    const container = messageContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [viewKey]);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const handleSuggestionClick = (suggestion: string) => {
    // Send the suggestion as the user's next question
    setUserInput("");
    void ask(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        return;
      } else {
        e.preventDefault();
        sendMessage();
      }
    }
  };
  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div
        className="min-h-0 flex-1 overflow-auto"
        ref={messageContainerRef}
        style={{ scrollbarColor: "#ffffff9f #ffffff00" }}
      >
        {messages.map((message) => (
          <Message
            key={message.id}
            text={message.text}
            sender={message.sender}
            suggestions={message.suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        ))}
      </div>

      {/* Equal padding on every side and items-end: the send button sits bottom-right in
          every state, which is vertically centred while the input is one line tall */}
      <div className="flex shrink-0 items-end gap-2.5 rounded-[0.65rem] border border-white/10 bg-black/35 p-2.5 focus-within:border-brand/70">
        <textarea
          ref={inputRef}
          rows={1}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Message RAG Chatbot"
          maxLength={MAX_QUESTION_CHARS}
          onKeyDown={handleKeyDown}
          style={{ scrollbarColor: "#ffffff9f #ffffff0f" }}
          // One line is 20px + 12px padding = 32px, the send button's height; caps at 3 lines
          className="max-h-[72px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
        ></textarea>
        <button
          type="button"
          aria-label="Send message"
          onClick={sendMessage}
          disabled={!userInput.trim()}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[filter,opacity] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
