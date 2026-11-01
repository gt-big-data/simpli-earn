"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardTab from "@/components/DashboardTab";
import VideoFrame from "@/components/VideoFrame";
import SummaryFrame from "@/components/SummaryFrame";
import ChartsFrame from "@/components/ChartsFrame";
import ChatFrame from "@/components/ChatFrame";
import type { PipelineState } from "@/components/ChartsFrame";
import { useChatController } from "@/lib/use-chat-controller";
import { API_BASE_URL } from "@/lib/api-config";
import { MOTION_EASING, MOTION_MS, prefersReducedMotion } from "@/lib/motion";

type SummarySection = {
  heading?: string | null;
  text: string;
  bullet?: boolean;
  timestamp: number | null;
};

const PIPELINE_STATUS_TEXT: Record<string, string> = {
  pending: "Queued for processing…",
  running: "Transcribing the call and analyzing sentiment — this usually takes a few minutes…",
};

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [summarySections, setSummarySections] = useState<SummarySection[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Custom links open here right away with `job=<id>` while the pipeline (download, transcript,
  // sentiment) runs. Poll it; when it finishes, drop the param so summary/charts load normally.
  const jobId = searchParams.get("job");
  // Latest poll result, tagged with its job; a job with no result yet counts as pending
  const [jobState, setJobState] = useState<{ jobId: string; pipeline: PipelineState | null } | null>(null);
  const pipeline: PipelineState | null = !jobId
    ? null
    : jobState?.jobId === jobId
      ? jobState.pipeline
      : { status: "pending" };

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const setPipeline = (next: PipelineState | null) => setJobState({ jobId, pipeline: next });
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("job");
      setPipeline(null);
      router.replace(`/dashboard?${params.toString()}`);
    };

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/job-status/${encodeURIComponent(jobId)}`);
        if (cancelled) return;
        // 404: API restarted and forgot the in-memory job; just try loading whatever exists
        if (res.status === 404) return finish();
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "completed") return finish();
        if (data.status === "failed") {
          setPipeline({ status: "failed", error: data.error || "Unknown error" });
          return;
        }
        setPipeline({ status: data.status });
      } catch {
        // API briefly unreachable; keep polling
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, router, searchParams]);

  useEffect(() => {
    // Summary needs the transcript the job is still producing
    if (searchParams.get("job")) return;

    const fetchSummary = async () => {
      const id = searchParams.get("id");
      const videoUrl = searchParams.get("video_url");

      setSummaryLoading(true);
      try {
        let res;
        if (videoUrl) {
          res = await fetch(`${API_BASE_URL}/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ video_url: videoUrl }),
          });
        } else {
          res = await fetch(`${API_BASE_URL}/summary?id=${id || "1"}`);
        }

        let data: { summary?: string; detail?: string; sections?: SummarySection[] };
        try {
          data = await res.json();
        } catch {
          setSummary("❌ Could not parse server response. Ensure the RAG API is running on port 8000.");
          setSummarySections([]);
          return;
        }

        if (!res.ok) {
          const msg = data?.detail ?? `Server error (${res.status})`;
          setSummary(`❌ Summary unavailable: ${msg}. If you use OpenAI, check your API quota at platform.openai.com.`);
          setSummarySections([]);
          return;
        }

        if (data.summary) {
          setSummary(data.summary);
          setSummarySections(
            (data.sections || []).map((section) => ({
              heading: section.heading ?? null,
              text: section.text,
              bullet: section.bullet ?? false,
              timestamp: section.timestamp,
            }))
          );
        } else {
          setSummary("No summary found.");
          setSummarySections([]);
        }
      } catch (err) {
        console.error("Error fetching summary:", err);
        setSummary("❌ Failed to connect to the summary API. Ensure the RAG API is running (port 8000) and try again.");
        setSummarySections([]);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [searchParams]);

  const summaryPlaceholder =
    pipeline?.status === "failed"
      ? null
      : pipeline
        ? PIPELINE_STATUS_TEXT[pipeline.status] ?? PIPELINE_STATUS_TEXT.running
        : summaryLoading
          ? "Generating summary…"
          : null;

  const failedSummary = pipeline?.status === "failed" ? `❌ Processing this call failed:\n${pipeline.error}` : null;

  // Summary alone (full height) vs summary + SimpliChat. chatClosing keeps the chat mounted while
  // it animates closed. A link to a chat (?chat=, from "All chats") opens with SimpliChat showing.
  const [chatOpen, setChatOpen] = useState(() => !!searchParams.get("chat"));
  const [chatClosing, setChatClosing] = useState(false);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatAnimation = useRef<Animation | null>(null);
  // Summary height just before a split change; set only when that change should animate
  const summaryFromHeight = useRef<number | null>(null);
  const [timestamp, setTimestamp] = useState<number>(0);
  const [seekNonce, setSeekNonce] = useState(0);

  const chat = useChatController(searchParams.get("id"), searchParams.get("video_url"), chatOpen, searchParams.get("chat"));

  const changeChatOpen = (open: boolean, animate: boolean) => {
    // Only the side-by-side (lg+) layout animates; stacked, the chat just appears below
    const animated = animate && !prefersReducedMotion() && window.matchMedia("(min-width: 1024px)").matches;
    summaryFromHeight.current = animated ? summaryPanelRef.current?.getBoundingClientRect().height ?? null : null;
    setChatClosing(!open && summaryFromHeight.current !== null);
    setChatOpen(open);
  };
  const handleChatOpen = () => changeChatOpen(true, true);
  // Closing from fullscreen skips the animation: the panel is an overlay, not in its slot
  const handleChatClose = (fromFullscreen: boolean) => changeChatOpen(false, !fromFullscreen);

  // Animate the split: the summary's height moves between full and top-row, while the chat grows
  // up from (or shrinks down to) the bottom edge it shares with the charts. Same timing for both,
  // so the gap between them only ever eases between 0 and 40px and they never overlap.
  useLayoutEffect(() => {
    const from = summaryFromHeight.current;
    summaryFromHeight.current = null;
    const summary = summaryPanelRef.current;
    if (from === null || !summary) return;

    const timing = { duration: MOTION_MS, easing: MOTION_EASING };
    summary.animate([{ height: `${from}px` }, { height: `${summary.getBoundingClientRect().height}px` }], timing);

    const chat = chatPanelRef.current;
    if (!chat) return;
    chatAnimation.current?.cancel();
    const hidden = { top: `${chat.getBoundingClientRect().height}px` };
    const shown = { top: "0px" };
    const animation = chat.animate(chatOpen ? [hidden, shown] : [shown, hidden], {
      ...timing,
      // Stay collapsed after closing until the chat unmounts
      fill: chatOpen ? "none" : "forwards",
    });
    chatAnimation.current = animation;
    if (!chatOpen) animation.onfinish = () => setChatClosing(false);
  }, [chatOpen]);

  const handleTimestampSeek = (nextTimestamp: number) => {
    setTimestamp(nextTimestamp);
    setSeekNonce((current) => current + 1);
  };

  return (
    <div className="relative min-h-[calc(100vh-57px)] w-full bg-background">
      <div className="w-full h-full">
        <div className="flex justify-center">
          <DashboardTab />
        </div>
        {/* Two rows shared by both columns: video | summary (top), charts | chat (bottom).
            Only the left column sizes the rows; the right-hand panels fill their grid area
            absolutely on lg+, so the columns stay aligned at the top and bottom. The dashboard
            stays mounted while SimpliChat is fullscreen; ChatFrame overlays it. */}
        <main className="grid grid-cols-1 lg:grid-cols-[62%_1fr] gap-[40px] px-[40px] pb-[30px] max-w-[1536px] m-auto">
          <div className="lg:col-start-1 lg:row-start-1">
            <VideoFrame timestamp={timestamp} seekNonce={seekNonce} />
          </div>
          {/* Fixed height: the charts frame sizes its tabs, not the other way round */}
          <div className="w-full h-120 lg:col-start-1 lg:row-start-2">
            <ChartsFrame onTimestampClick={handleTimestampSeek} pipeline={pipeline} />
          </div>
          <div
            className={`relative h-[500px] lg:h-auto lg:col-start-2 lg:row-start-1 ${
              chatOpen ? "" : "lg:row-span-2"
            }`}
          >
            <div ref={summaryPanelRef} className="h-full lg:absolute lg:inset-0">
              <SummaryFrame
                onOpenChat={handleChatOpen}
                halfHeight={chatOpen}
                summary={failedSummary ?? summary}
                summarySections={failedSummary ? [] : summarySections}
                onTimestampClick={handleTimestampSeek}
                placeholder={summaryPlaceholder}
              />
            </div>
          </div>
          {(chatOpen || chatClosing) && (
            <div className="relative min-h-[450px] lg:min-h-0 lg:col-start-2 lg:row-start-2">
              {/* lg: height comes from inset-0 alone, so animating top resizes the panel from the bottom */}
              <div ref={chatPanelRef} className="h-full lg:absolute lg:inset-0 lg:h-auto">
                <ChatFrame
                  onClose={handleChatClose}
                  chat={chat}
                />
              </div>
            </div>
          )}
        </main>
      </div>
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
