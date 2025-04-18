"use client";

import { IoClose } from "react-icons/io5";
import { Dispatch, SetStateAction } from "react";
import ChatBot, { Message } from "./ChatBot";
import { FaCompressAlt } from "react-icons/fa";

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
                    <div className="hidden xs:flex justify-start items-start rounded-tl-[30px] rounded-tr-[23px] w-full h-[40px] border-t border-white/25 relative"></div>

                    <div className="hidden xs:flex justify-end items-end rounded-b-[23px] w-full h-[40px] border-b border-white/25 relative"></div>
                    
                    {/* Close Button */}
                    <button
                        className="flex mt-3 xs:mt-0 rounded-tr-[30px] rounded-tl-[23px] w-full h-[40px] bordert-t-none xs:border-t border-white/25 cursor-pointer relative"
                        onClick={() => {
                            setFullscreen(false); // Exit fullscreen
                            onMinimizedChange(true); // Minimize chat
                            onMinimizedChange(false); // reset
                        }}
                    >
                        <h1 className="flex justify-end items-center font-bold text-sm font-montserrat w-full h-full text-white opacity-50">
                            <IoClose size={30} className="mt-4 mr-4" />
                        </h1>
                    </button>
                </div>

                <div className="flex w-full h-full">
                    <div className="w-1/4 -mt-10 border-white/25 border-x border-b bg-white/12 rounded-l-[30px] hidden lg:block">
                        <div className="w-full flex justify-between p-5">
                            <FaCompressAlt className="cursor-pointer z-100" size={20} onClick={() => setFullscreen(false)} />
                            <p className="text-lg font-bold -mt-1">SimpliChat</p>
                        </div>

                        <div className="p-5">
                            <p className="mb-2"><b>New Chat +</b></p>
                            <p>chat history</p>
                        </div>
                    </div>
                    <div className="-mt-10 pt-12 xs:pt-18 pb-8 px-8 w-full lg:w-3/4 rounded-r-[30px] rounded-l-[30px] lg:rounded-l-none border-b border-t xs:border-t-0 border-r border-white/25"><div className="relative h-full"><ChatBot fullscreen={fullscreen} messages={messages} setMessages={setMessages} /></div></div>
                </div>
            </div>
        </div>
    );
}
