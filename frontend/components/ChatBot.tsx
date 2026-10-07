"use client";

import { TbSend2 } from "react-icons/tb";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import Message from "./Message";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-config";

export type Message = {
  id: number;
  sender: string;
  text: string;
  suggestions?: string[]; // Optional array of follow-up question suggestions
  source?: string; // Transcript the exchange was about (dashboard id or video URL)
};

// The RAG API keeps no chat state: each request carries the earlier turns about the same
// transcript (messages stay on screen when switching dashboards, but history doesn't carry over).
const MAX_HISTORY_TURNS = 20;

function historyFor(messages: Message[], source: string) {
  const turns: { question: string; answer: string }[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const question = messages[i];
    const answer = messages[i + 1];
    if (
      question.sender === "user" &&
      answer.sender === "bot" &&
      question.source === source &&
      answer.source === source &&
      !answer.text.startsWith("⚠️")
    ) {
      turns.push({ question: question.text, answer: answer.text });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

export default function ChatBot({
  fullscreen,
  messages,
  setMessages,
}: {
  fullscreen: boolean;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
}) {
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id") || null;
  const videoUrl = searchParams.get("video_url") || null;

  const [userInput, setUserInput] = useState("");

  const messageContainerRef = useRef<HTMLDivElement>(null);

  const source = `${dashboardId ?? ""}|${videoUrl ?? ""}`;

  const askBot = async (text: string) => {
    // `messages` is the list before this question was added, i.e. exactly the earlier turns
    const history = historyFor(messages, source);
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
        id: messages.length + 2,
        sender: "bot", // Explicitly set to "bot"
        text: data.response || "⚠️ No response from server.",
        suggestions: data.suggestions || [], // Include suggestions from API
        source,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: messages.length + 2,
        sender: "bot", // Explicitly set to "bot"
        text: "⚠️ Failed to connect to server. Check API is running.",
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error("Error sending message:", error);
    }
  };

  const sendMessage = async () => {
    if (userInput.trim()) {
      const newMessage: Message = {
        id: messages.length + 1,
        sender: "user",
        text: userInput,
        source,
      };
      setMessages((prev) => [...prev, newMessage]);
      setUserInput("");
      await askBot(userInput);
    }
  };

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const handleSuggestionClick = (suggestion: string) => {
    // Set the suggestion as input and automatically send it
    setUserInput(suggestion);

    // Create a user message with the suggestion
    const newMessage: Message = {
      id: messages.length + 1,
      sender: "user",
      text: suggestion,
      source,
    };
    setMessages((prev) => [...prev, newMessage]);

    // Send the suggestion to the backend
    void askBot(suggestion);

    // Clear the input
    setUserInput("");
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
    <div className="relative h-full w-full">
      <div
        className={`absolute grid grid-cols-1 grid-rows-2 gap-0 w-full ${
          fullscreen ? "h-[calc(100%-140px)]" : "h-[calc(100%-170px)]"
        }`}
      >
        <div
          className="flex row-start-1 row-span-2 overflow-auto"
          ref={messageContainerRef}
          style={{ scrollbarColor: "#ffffff9f #ffffff00" }}
        >
          <div className="">
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
        </div>

        <div className="absolute w-full bottom-[-130px] flex flex-col items-end">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Message RAG Chatbot"
            onKeyDown={handleKeyDown}
            style={{ scrollbarColor: "#ffffff9f #ffffff0f" }}
            className="w-full h-[120px] p-3 bg-white/4 text-white rounded-[15px] border-[1px] border-white/25 resize-none"
          ></textarea>
          <div
            className="-mt-13 mr-3 py-1.5 px-3 bg-white/15 text-white rounded-full border-[1px] border-white/25 cursor-pointer"
            onClick={sendMessage}
          >
            <TbSend2 size={25} />
          </div>
        </div>
      </div>
    </div>
  );
}
