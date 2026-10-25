"use client";

import { Send } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Message from "./Message";
import { MAX_QUESTION_CHARS, type ChatMessage } from "@/lib/chat-history";

export type Message = ChatMessage;

export default function ChatBot({ messages, ask, disabled, pendingRequestId, viewKey }: {
  messages: Message[];
  ask: (text: string, retryRequestId?: string) => Promise<void>;
  disabled: boolean;
  pendingRequestId: string | null;
  viewKey?: string;
}) {
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

  const sendMessage = async () => {
    if (!disabled && userInput.trim()) {
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
    if (!disabled) void ask(suggestion);
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
          <div key={message.id}>
            <Message
              text={message.text}
              sender={message.sender}
              suggestions={disabled ? [] : message.suggestions}
              onSuggestionClick={handleSuggestionClick}
            />
            {message.sender === "user" && message.requestId && !messages.some(
              reply => reply.sender === "bot" && reply.requestId === message.requestId
            ) && (
              <div className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {pendingRequestId === message.requestId ? "Generating answer…" : (
                  <><span>{message.error || "No saved answer yet."}</span>{" "}
                    <button type="button" className="cursor-pointer text-brand underline disabled:opacity-40"
                      disabled={disabled} onClick={() => void ask(message.text, message.requestId)}>Retry</button>
                  </>
                )}
              </div>
            )}
          </div>
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
          disabled={disabled}
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
          disabled={disabled || !userInput.trim()}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[filter,opacity] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
