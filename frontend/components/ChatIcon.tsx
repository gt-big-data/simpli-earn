import { Dispatch, SetStateAction } from "react";
import { LuBotMessageSquare } from "react-icons/lu";

export default function ChatIcon({ setExpandedChat }: { setExpandedChat: Dispatch<SetStateAction<boolean>> }) {
    return (
        <div onClick={() => setExpandedChat((prev) => (!prev))} className="transition-all chat_circle border absolute z-3 h-[75px] w-[75px] rounded-full p-4 border-white/25 flex justify-center items-center bg-black/50 bottom-0 right-0 hover:brightness-90">
            <LuBotMessageSquare className="w-full h-full" />
        </div>
    )
}