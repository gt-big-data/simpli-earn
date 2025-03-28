"use client"

import DashboardTab from "@/components/DashboardTab";
import VideoFrame from "@/components/VideoFrame";
import SummaryFrame from "@/components/SummaryFrame";
import ChartsFrame from "@/components/ChartsFrame";
import { useState } from "react";
import ChatFrame from "@/components/ChatFrame";
import FullChat from "@/components/FullChat";

export default function Dashboard() {
  const [expandedChat, setExpandedChat] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      style={{
        background:
          'radial-gradient(50% 50% at 50% 50%, rgba(129, 209, 141, 0.1) 0%, rgba(217, 217, 217, 0) 100%)',
      }}
      className="font-[family-name:var(--font-geist-sans)] w-full min-h-screen"
    >
     <div className="flex justify-center col-start-3 col-span-1">
        <DashboardTab />
      </div>
      {!fullscreen && <main className="grid grid-cols-21 grid-rows-2 gap-[40px]">
        <div className="flex justify-start items-start ml-[40px] col-start-1 col-span-13 row-span-1">
          <VideoFrame />
        </div>
        <div className="flex flex-col mr-[40px] -mt-[40px] col-start-14 col-span-8 row-span-2 row-start-1 max-h-[calc(100%-40px)]">
          <div className=""><SummaryFrame setExpandedChat={setExpandedChat} /></div>
          <div className="h-1/3 mt-4">{expandedChat && <ChatFrame setFullscreen={setFullscreen} />}</div>
        </div>
        <div className="flex justify-start items-start ml-[40px] pb-[40px] col-start-1 col-span-13 row-span-1 row-start-2 max-h-[calc(100%-40px)]">
          <ChartsFrame />
        </div>
      </main>}
      {fullscreen && <FullChat setFullscreen={setFullscreen} />}
    </div>
  );
}
