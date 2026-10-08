"use client";

import { Suspense, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardTab from "@/components/DashboardTab";
import VideoFrame from "@/components/VideoFrame";
import SummaryFrame from "@/components/SummaryFrame";
import ChartsFrame from "@/components/ChartsFrame";
import ChatFrame from "@/components/ChatFrame";
import FullChat from "@/components/FullChat";
import type { PipelineState } from "@/components/ChartsFrame";
import type { Message } from "@/components/ChatBot";
import { useAuth } from "@/lib/auth/AuthContext";
import { chatForAccount, startChat, updateMessages, type AccountChat } from "@/lib/account-chat";
import { API_BASE_URL } from "@/lib/api-config";

type SummarySection = {
  heading?: string | null;
  text: string;
  bullet?: boolean;
  timestamp: number | null;
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    sender: "bot",
    text: "Hi, I'm SimpliBot! Feel free to ask me any questions about the given earnings call!",
  },
];

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
          setSummary(data.summary.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>"));
          setSummarySections(
            (data.sections || []).map((section) => ({
              heading: section.heading ?? null,
              text: section.text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>"),
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

  const [activeDisplay, setActiveDisplay] = useState("full");
  const [chatMinimized, setChatMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [timestamp, setTimestamp] = useState<number>(0);
  const [seekNonce, setSeekNonce] = useState(0);

  // The chat (which is also the history sent to the RAG API) belongs to the account that wrote it.
  // Any account change (sign out, sign in, switch) replaces it; see lib/account-chat.ts.
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const [chat, setChat] = useState<AccountChat>(() => startChat(accountId, INITIAL_MESSAGES));
  const currentChat = chatForAccount(chat, accountId, INITIAL_MESSAGES);
  if (currentChat !== chat) {
    // Adjusting state while rendering (React's pattern for resetting state when an input changes)
    setChat(currentChat);
  }
  const messages = currentChat.messages;
  const { epoch } = currentChat;
  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(
    (update) => setChat((prev) => updateMessages(prev, epoch, update)),
    [epoch]
  );

  const handleChatMinimized = (isMinimized: boolean) => {
    setChatMinimized(isMinimized);
    if (isMinimized) {
      setActiveDisplay("full");
    }
  };

  const handleTimestampSeek = (nextTimestamp: number) => {
    setTimestamp(nextTimestamp);
    setSeekNonce((current) => current + 1);
  };

  return (
    <div
      style={{
        background:
          "radial-gradient(50% 50% at 50% 50%, rgba(129, 209, 141, 0.1) 0%, rgba(217, 217, 217, 0) 100%)",
      }}
      className="w-full min-h-[calc(100vh-57px)] relative"
    >
      <div className="w-full h-full">
        <div className="flex justify-center">
          <DashboardTab />
        </div>
        {!fullscreen && (
          <main className="grid grid-cols-1 lg:grid-cols-[62%_1fr] xl:grid-cols-[62%_1fr] gap-[40px] px-[40px] pb-[30px] max-w-[1536px] m-auto">
            <div className="flex flex-col gap-[40px]">
              <VideoFrame timestamp={timestamp} seekNonce={seekNonce} />
              <div className="w-full grow min-h-[450px]">
                <ChartsFrame onTimestampClick={handleTimestampSeek} pipeline={pipeline} />
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
                  summary={failedSummary ?? summary}
                  summarySections={failedSummary ? [] : summarySections}
                  onTimestampClick={handleTimestampSeek}
                  placeholder={summaryPlaceholder}
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
