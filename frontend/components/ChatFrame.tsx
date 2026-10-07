"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";

interface ChatFrameProps {
    onMinimizedChange: (minimized: boolean) => void;
    minimized: boolean;
    setFullscreen: Dispatch<SetStateAction<boolean>>;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
    fullscreen: boolean;
}

export default function ChatFrame({ onMinimizedChange, minimized, setFullscreen, messages, setMessages, fullscreen }: ChatFrameProps) {
    
    // Remove local minimized state since we're using props now

  // Sync local UI with parent's minimized state
  useEffect(() => {
    if (minimized) {
      setFullscreen(false);
    }
  }, [minimized, setFullscreen]);

  const handleMinimize = () => {
    onMinimizedChange(true); // Notify parent to minimize
  };

  const handleExpand = () => {
    onMinimizedChange(false); // Notify parent
    setFullscreen(true);
  };

  if (minimized) {
    return null; // Or render a minimized chat button
  }

    return (
        <div className="surface h-full w-full rounded-2xl p-5 text-foreground">
            <div className="relative h-full w-full">
                <div className="flex justify-between">
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Expand chat" onClick={handleExpand}>
                      <Maximize2 className="size-4" />
                    </button>
                    <h1 className="text-lg font-medium">SimpliChat</h1>
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Close chat" onClick={handleMinimize}>
                      <X className="size-4" />
                    </button>
                </div>
                <ChatBot fullscreen={fullscreen} messages={messages} setMessages={setMessages}/>
            </div>
        </div>
    );
}
