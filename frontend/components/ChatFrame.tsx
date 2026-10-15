"use client";

import { Maximize2, X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";

interface ChatFrameProps {
    onClose: () => void;
    setFullscreen: Dispatch<SetStateAction<boolean>>;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
}

export default function ChatFrame({ onClose, setFullscreen, messages, setMessages }: ChatFrameProps) {
    
  const handleExpand = () => {
    setFullscreen(true);
  };

    return (
        <div className="surface flex h-full w-full flex-col rounded-2xl text-foreground">
                <div className="panel-header justify-between">
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Expand chat" onClick={handleExpand}>
                      <Maximize2 className="size-4" />
                    </button>
                    <h1 className="text-lg font-medium">SimpliChat</h1>
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Close chat" onClick={onClose}>
                      <X className="size-4" />
                    </button>
                </div>
                <div className="relative min-h-0 w-full flex-1 px-5 pb-5">
                    <ChatBot messages={messages} setMessages={setMessages}/>
                </div>
        </div>
    );
}
