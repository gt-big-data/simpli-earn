"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import DashboardTab from "@/components/DashboardTab";
import VideoFrame from "@/components/VideoFrame";
import SummaryFrame from "@/components/SummaryFrame";
import ChartsFrame from "@/components/ChartsFrame";
import ChatFrame from "@/components/ChatFrame";
import FullChat from "@/components/FullChat";

function DashboardContent() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState("Loading summary...");

  useEffect(() => {
    const fetchSummary = async () => {
      const id = searchParams.get("id");
      const videoUrl = searchParams.get("video_url");

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        let res;
        if (videoUrl) {
          res = await fetch(`${apiUrl}/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ video_url: videoUrl }),
          });
        } else {
          res = await fetch(`${apiUrl}/summary?id=${id || "1"}`);
        }

        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>"));
        } else {
          setSummary("⚠️ No summary found.");
        }
      } catch (err) {
        console.error("Error fetching summary:", err);
        setSummary("❌ Failed to load summary.");
      }
    };

    fetchSummary();
  }, [searchParams]);

  const [activeDisplay, setActiveDisplay] = useState("full");
  const [chatMinimized, setChatMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [timestamp, setTimestamp] = useState<number>(0);

  const messageArray = [
    {
      id: 1,
      sender: "bot",
      text: "Hi, I'm SimpliBot! Feel free to ask me any questions about the given earnings call!",
    },
  ];
  const [messages, setMessages] = useState(messageArray);

  const handleChatMinimized = (isMinimized: boolean) => {
    setChatMinimized(isMinimized);
    if (isMinimized) {
      setActiveDisplay("full");
    }
  };

  return (
    <div
      style={{
        background:
          "radial-gradient(50% 50% at 50% 50%, rgba(129, 209, 141, 0.1) 0%, rgba(217, 217, 217, 0) 100%)",
      }}
      className="font-[family-name:var(--font-geist-sans)] w-full min-h-[calc(100vh-57px)] relative"
    >
      <div className="w-full h-full">
        <div className="flex justify-center">
          <DashboardTab />
        </div>
        {!fullscreen && (
          <main className="grid grid-cols-1 lg:grid-cols-[62%_1fr] xl:grid-cols-[62%_1fr] gap-[40px] px-[40px] pb-[30px] max-w-[1536px] m-auto">
            <div className="flex flex-col gap-[40px]">
              <VideoFrame timestamp={timestamp} />
              <div className="w-full grow min-h-[450px]">
                <ChartsFrame onTimestampClick={setTimestamp} />
              </div>
            </div>
            <div className="flex flex-col gap-[40px] -mt-[40px] sm:max-h-[1100px]">
              <div
                className={`h-[500px] ${
                  activeDisplay == "full"
                    ? "lg:h-[calc(34.875vw+542.1px)] 2xl:h-[1077.78px]"
                    : "lg:h-[calc(0.34875*(100vw-80px)+80px)] 2xl:h-[587.78px]"
                }`}
              >
                <SummaryFrame
                  setActiveDisplay={setActiveDisplay}
                  halfHeight={activeDisplay !== "full"}
                  summary={summary}
                />
              </div>
              {!fullscreen && !(activeDisplay == "full") && (
                <div className="grow min-h-[450px]">
                  <ChatFrame
                    onMinimizedChange={handleChatMinimized}
                    minimized={chatMinimized}
                    setFullscreen={setFullscreen}
                    messages={messages}
                    setMessages={setMessages}
                    fullscreen={fullscreen}
                  />
                </div>
              )}
            </div>
          </main>
        )}
      </div>

      {fullscreen && (
        <FullChat
          fullscreen={fullscreen}
          setFullscreen={setFullscreen}
          onMinimizedChange={handleChatMinimized}
          messages={messages}
          setMessages={setMessages}
        />
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
