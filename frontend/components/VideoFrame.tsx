import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import preloadedVideos from "@/lib/preloaded_videos.json";
import { extractVideoId } from "@/lib/youtube";

interface VideoFrameProps {
  timestamp: number;
  seekNonce: number;
}

const PRELOADED_VIDEOS = preloadedVideos as Record<string, { url: string; title: string }>;

// Outline geometry, matching the chart tab bar in ChartsFrame
const TAB_HEIGHT = 40;
const TAB_WIDTH_RATIO = 0.53;
const CURVE_WIDTH = 24;
const RADIUS = 16; // rounded-2xl, same as the other dashboard frames

// One continuous outline for the title tab and the video body below it. Every coordinate is
// offset by half the 1px stroke so the line lands on whole pixels.
function framePath(width: number, height: number) {
  const tabEnd = Math.round(width * TAB_WIDTH_RATIO);
  const top = 0.5;
  const bodyTop = TAB_HEIGHT + 0.5;
  const right = width - 0.5;
  const bottom = height - 0.5;
  const left = 0.5;
  const mid = tabEnd + CURVE_WIDTH / 2;
  return [
    `M${left} ${RADIUS}`,
    `A${RADIUS - 0.5} ${RADIUS - 0.5} 0 0 1 ${RADIUS} ${top}`,
    `L${tabEnd} ${top}`,
    `C${mid} ${top} ${mid} ${bodyTop} ${tabEnd + CURVE_WIDTH} ${bodyTop}`,
    `L${width - RADIUS} ${bodyTop}`,
    `A${RADIUS - 0.5} ${RADIUS - 0.5} 0 0 1 ${right} ${TAB_HEIGHT + RADIUS}`,
    `L${right} ${height - RADIUS}`,
    `A${RADIUS - 0.5} ${RADIUS - 0.5} 0 0 1 ${width - RADIUS} ${bottom}`,
    `L${RADIUS} ${bottom}`,
    `A${RADIUS - 0.5} ${RADIUS - 0.5} 0 0 1 ${left} ${height - RADIUS}`,
    "Z",
  ].join(" ");
}

export default function VideoFrame({ timestamp, seekNonce }: VideoFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const searchParams = useSearchParams();

  // Derived from the URL: ?video_url=... for custom calls, ?id=N for preloaded dashboards
  const { videoId, videoTitle } = useMemo(() => {
    const encodedVideoUrl = searchParams.get("video_url");
    const dashboardId = searchParams.get("id");

    let finalVideoUrl = "";
    let title = encodedVideoUrl;

    if (encodedVideoUrl) {
      finalVideoUrl = decodeURIComponent(encodedVideoUrl);
    } else if (dashboardId && PRELOADED_VIDEOS[dashboardId]) {
      finalVideoUrl = PRELOADED_VIDEOS[dashboardId].url;
      title = PRELOADED_VIDEOS[dashboardId].title;
    }

    const videoId = extractVideoId(finalVideoUrl);
    return videoId
      ? { videoId, videoTitle: title || "" }
      : { videoId: null, videoTitle: "Loading..." };
  }, [searchParams]);

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

  // The outline is drawn from the frame's measured size, so re-measure whenever it resizes
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      setFrameSize({ width: frame.offsetWidth, height: frame.offsetHeight });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="flex flex-col text-foreground w-full relative mt-[20px] lg:mt-0">
      {frameSize && (
        <svg
          aria-hidden
          width={frameSize.width}
          height={frameSize.height}
          className="absolute inset-0 pointer-events-none"
        >
          <path
            d={framePath(frameSize.width, frameSize.height)}
            fill="var(--surface)"
            stroke="var(--border)"
            strokeWidth={1}
          />
        </svg>
      )}
      <div
        className="relative flex items-center h-[40px] px-6"
        style={{ width: `${TAB_WIDTH_RATIO * 100}%` }}
      >
        <h1 className="w-full truncate font-medium text-xs">
          {videoTitle}
        </h1>
      </div>
      {/* Inset by the 1px outline; inner corners are the frame radius minus the border */}
      <div className="relative mx-px mt-px mb-px aspect-16/9 overflow-hidden rounded-b-[15px] rounded-tr-[15px]">
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
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading video...
          </div>
        )}
      </div>
    </div>
  );
}
