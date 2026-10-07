"use client";

import { Minimize2, X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";

interface FullChatProps {
    setFullscreen: Dispatch<SetStateAction<boolean>>;
    onMinimizedChange: (minimized: boolean) => void;
    fullscreen: boolean;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
}

export default function FullChat({ setFullscreen, onMinimizedChange, fullscreen, messages, setMessages }: FullChatProps) {
    return (
        <div className="xs:-mt-4 px-5 pb-5 w-full h-[calc(100vh-82px)] z-50">
            <div className="flex flex-col w-full h-full relative">
                <div className="grid xs:grid-cols-[1fr_400px_1fr] relative justify-end xs:justify-between">
                    {/* SimpliChat Button */}
                    <div className="relative hidden h-10 w-full items-start justify-start rounded-tl-2xl border-t border-white/8 xs:flex"></div>

                    <div className="relative hidden h-10 w-full items-end justify-end border-b border-white/8 xs:flex"></div>
                    
                    {/* Close Button */}
                    <button
                        className="relative mt-3 flex h-10 w-full cursor-pointer rounded-tr-2xl border-white/8 xs:mt-0 xs:border-t"
                        onClick={() => {
                            setFullscreen(false); // Exit fullscreen
                            onMinimizedChange(true); // Minimize chat
                            onMinimizedChange(false); // reset
                        }}
                    >
                        <h1 className="flex h-full w-full items-center justify-end text-sm font-medium text-muted-foreground">
                            <X className="mt-4 mr-4 size-4" />
                        </h1>
                    </button>
                </div>

                <div className="flex w-full h-full">
                    <div className="surface -mt-10 hidden w-1/4 rounded-l-2xl border-x border-b lg:block">
                        <div className="flex w-full justify-between p-5">
                            <button type="button" className="z-100 cursor-pointer" aria-label="Exit fullscreen" onClick={() => setFullscreen(false)}>
                              <Minimize2 className="size-4" />
                            </button>
                            <p className="-mt-1 text-lg font-medium">SimpliChat</p>
                        </div>

                        <div className="p-5">
                            <p className="mb-2"><b>New Chat +</b></p>
                            <p>chat history</p>
                        </div>
                    </div>
                    <div className="surface -mt-10 h-full w-full rounded-2xl px-8 pt-12 pb-8 xs:pt-18 lg:w-3/4 lg:rounded-l-none"><div className="relative h-full"><ChatBot fullscreen={fullscreen} messages={messages} setMessages={setMessages} /></div></div>
                </div>
            </div>
        </div>
    );
}
