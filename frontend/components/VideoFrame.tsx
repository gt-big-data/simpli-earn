import React, { useEffect, useRef, useState } from "react";
import preloadedVideos from "@/lib/preloaded_videos.json";

interface VideoFrameProps {
  timestamp: number;
  seekNonce: number;
}

const PRELOADED_VIDEOS = preloadedVideos as Record<string, { url: string; title: string }>;

export default function VideoFrame({ timestamp, seekNonce }: VideoFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>("Loading...");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const encodedVideoUrl = params.get("video_url");
      const dashboardId = params.get("id");

      let finalVideoUrl = "";
      let title = params.get("video_url");

      if (encodedVideoUrl) {
        finalVideoUrl = decodeURIComponent(encodedVideoUrl);
      } else if (dashboardId && PRELOADED_VIDEOS[dashboardId]) {
        finalVideoUrl = PRELOADED_VIDEOS[dashboardId].url;
        title = PRELOADED_VIDEOS[dashboardId].title;
      }

      const videoIdMatch = finalVideoUrl.match(/(?:[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
      if (videoIdMatch) {
        setVideoId(videoIdMatch[1]);
        setVideoTitle(title || "");
      }
    }
  }, []);

  useEffect(() => {
    const player = iframeRef.current;
    if (player && videoId) {
      player.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [timestamp, true] }),
        "*"
      );
      player.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*"
      );
    }
  }, [timestamp, videoId, seekNonce]);

  return (
    <div className="flex text-white w-full relative mt-[20px] lg:mt-0">
      <div className="flex flex-row absolute w-full h-[40px]">
        <button className="relative w-[53%] h-[40px] border-t-[1px] border-l-[1px] border-white/25 rounded-tl-[30px] rounded-tr-[23px] px-8 flex items-center">
          <h1 className="w-full overflow-hidden justify-text-ellipsis whitespace-nowrap font-bold text-sm font-montserrat">
            {videoTitle}
          </h1>
        </button>
        <div className="flex justify-end rounded-bl-[23px] w-1/10 h-[40px] border-b-[1px] border-[#505050] relative"></div>
        <div className="absolute top-1/2 left-[53%] w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transform -rotate-20"></div>
      </div>
      <div className="justify-center items-center bg-white/4 text-white mt-[39px] rounded-b-[30px] rounded-tr-[30px] overflow-hidden aspect-16/9 w-full border border-white/25">
        {videoId ? (
          <iframe
            ref={iframeRef}
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&controls=1&modestbranding=1&showinfo=0&rel=0`}
            title={videoTitle}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        ) : (
          <div className="flex justify-center items-center h-full text-gray-400">
            Loading video...
          </div>
        )}
      </div>
    </div>
  );
}
