"use client";

import { Minimize2, X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";

interface FullChatProps {
    setFullscreen: Dispatch<SetStateAction<boolean>>;
    onClose: () => void;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
}

export default function FullChat({ setFullscreen, onClose, messages, setMessages }: FullChatProps) {
    return (
        // A true fullscreen overlay: covers the whole viewport (footer included) with even padding
        <div className="fixed inset-0 z-50 bg-background p-5">
            {/* One panel, like the docked SimpliChat: a header row, then the history sidebar and
                the chat side by side in a single row so they share one top and bottom edge */}
            <div className="surface flex h-full w-full flex-col overflow-hidden rounded-2xl text-foreground">
                <div className="panel-header justify-between">
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Exit fullscreen" onClick={() => setFullscreen(false)}>
                        <Minimize2 className="size-4" />
                    </button>
                    <h1 className="text-lg font-medium">SimpliChat</h1>
                    <button type="button" className="cursor-pointer text-foreground" aria-label="Close chat" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>

                <div className="flex min-h-0 w-full flex-1 border-t border-white/8">
                    <aside className="hidden w-1/4 border-r border-white/8 p-5 lg:block">
                        <p className="mb-2"><b>New Chat +</b></p>
                        <p>chat history</p>
                    </aside>

                    <div className="min-h-0 min-w-0 flex-1 px-8 pt-5 pb-8">
                        <ChatBot messages={messages} setMessages={setMessages} />
                    </div>
                </div>
            </div>
        </div>
    );
}
