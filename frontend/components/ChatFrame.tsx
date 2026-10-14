"use client";

import { Maximize2, X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";

interface ChatFrameProps {
    onClose: () => void;
    setFullscreen: Dispatch<SetStateAction<boolean>>;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
    fullscreen: boolean;
}

export default function ChatFrame({ onClose, setFullscreen, messages, setMessages, fullscreen }: ChatFrameProps) {
    
  const handleExpand = () => {
    setFullscreen(true);
  };

    return (
        <div className="surface h-full w-full rounded-2xl p-5 text-foreground">
            <div className="relative h-full w-full">
                <div className="flex justify-between">
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Expand chat" onClick={handleExpand}>
                      <Maximize2 className="size-4" />
                    </button>
                    <h1 className="text-lg font-medium">SimpliChat</h1>
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Close chat" onClick={onClose}>
                      <X className="size-4" />
                    </button>
                </div>
                <ChatBot fullscreen={fullscreen} messages={messages} setMessages={setMessages}/>
            </div>
        </div>
    );
}
