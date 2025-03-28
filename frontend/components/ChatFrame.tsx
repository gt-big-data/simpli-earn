"use client";

import { IoClose } from "react-icons/io5";
import { Dispatch, SetStateAction } from "react";
import ChatBot from "./ChatBot";
import { FaExpandAlt } from "react-icons/fa";

export default function ChatFrame({ setFullscreen }: { setFullscreen: Dispatch<SetStateAction<boolean>> }) {

    return (
        <div className="bg-white/4 text-white rounded-[30px] w-full h-full border-[0.85px] border-white/35 p-5">
            <div className="relative w-full h-full">
                <div className="flex justify-between">
                    <FaExpandAlt className="cursor-pointer" size={20} onClick={() => setFullscreen(true)} />
                    <h1 className="font-bold text-lg">SimpliChat</h1>
                    <IoClose size={25} />
                </div>
                <ChatBot />
            </div>
        </div>
    );
}