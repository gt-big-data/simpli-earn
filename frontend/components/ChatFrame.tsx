"use client";

import { IoClose } from "react-icons/io5";
import { useEffect, Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";
import { FaExpandAlt } from "react-icons/fa";

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
        <div className="bg-white/4 text-white rounded-[30px] w-full h-full border-[1px] border-white/25 p-5">
            <div className="relative w-full h-full">
                <div className="flex justify-between">
                    <FaExpandAlt className="cursor-pointer" size={20} onClick={handleExpand} />
                    <h1 className="font-bold text-lg">SimpliChat</h1>
                    <IoClose size={25} className="cursor-pointer" onClick={handleMinimize} />
                </div>
                <ChatBot fullscreen={fullscreen} messages={messages} setMessages={setMessages}/>
            </div>
        </div>
    );
}
