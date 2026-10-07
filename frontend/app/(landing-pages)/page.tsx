"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Search, Send, Trash2 } from "lucide-react";
import mockCalls from "@/public/data/mock-calls.json";

import { useState, useEffect } from "react";

interface LibraryVideo {
  id: string;
  video_identifier: string;
  metadata: {
    title: string;
    ticker: string;
    upload_date: string;
  };
  created_at: string;
}

export default function Home() {
  const [youtubeLink, setYoutubeLink] = useState("");
  const [tickerSymbol, setTickerSymbol] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  // Load library videos from database
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const response = await fetch("http://localhost:8001/library");
        const data = await response.json();
        setLibraryVideos(data.videos || []);
      } catch (error) {
        console.error("Failed to load library:", error);
      }
    };
    fetchLibrary();
  }, []);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!youtubeLink.trim()) return;
    
    setIsProcessing(true);
    setProcessingStatus("Starting dashboard creation...");
    
    try {
      // Trigger dashboard creation
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/dashboard/create-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          youtube_url: youtubeLink,
          ticker: tickerSymbol.trim().toUpperCase() || undefined
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || `Request failed: ${response.status}`);
      }

      // Go straight to the dashboard: the video plays right away and the summary / sentiment
      // show placeholders while the job runs (the dashboard polls it via the `job` param).
      // Already-processed videos come back with no job_id and load immediately.
      const tickerParam = tickerSymbol?.trim() ? `&ticker=${encodeURIComponent(tickerSymbol.trim().toUpperCase())}` : "";
      const jobParam = data.job_id ? `&job=${encodeURIComponent(data.job_id)}` : "";
      setProcessingStatus("Opening dashboard...");
      window.location.href = `/dashboard?video_url=${encodeURIComponent(youtubeLink)}${tickerParam}${jobParam}`;
      
    } catch (error) {
      console.error("Failed to create dashboard:", error);
      setProcessingStatus("Failed to start processing. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleDelete = async (videoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm("Are you sure you want to delete this earnings call?")) return;
    
    try {
      await fetch(`http://localhost:8001/library/${videoId}`, {
        method: "DELETE",
      });
      
      // Refresh library
      setLibraryVideos(prev => prev.filter(v => v.video_identifier !== videoId));
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete video");
    }
  };

  return (
    <div className="justify-items-center px-8 pt-36 pb-24 md:px-12 md:pt-40 md:pb-28">
      <main className="flex max-w-[1100px] flex-col items-center gap-8 text-center">
        <p className="rounded-[10px] bg-pill px-2.5 py-1 text-sm font-light text-foreground">
          Investing. Made simple.
        </p>
        <h1 className="mt-2 text-4xl font-light tracking-tight sm:text-6xl md:text-7xl">
          Turning Earnings Calls Into{" "}
          <span className="text-brand">Actionable Insights</span>
        </h1>
        <h4 className="mb-4 text-lg font-light text-foreground sm:text-xl">
          Our AI-powered platform <u>simplifies earnings calls</u>, providing
          easy-to-understand summaries, sentiment analysis, and actionable
          insights, helping you make informed financial decisions.
        </h4>
        <div className="surface w-full rounded-2xl p-7 text-left">
          <h4 className="mb-3 w-full text-lg font-medium">
            Upload an <span className="text-brand">earnings call</span> to get
            started:
          </h4>

          <div className="mb-3 flex w-full items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={youtubeLink}
                onChange={(e) => setYoutubeLink(e.target.value)}
                placeholder="Paste call link here...."
                className="field pl-9"
                disabled={isProcessing}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !youtubeLink.trim()}
              className="btn-primary shrink-0"
              aria-label="Start analysis"
            >
              <Send className="size-4" />
            </button>
          </div>

          <div className="mb-2 w-full">
            <label className="mb-1 block text-sm text-muted-foreground">
              Ticker Symbol <span className="text-brand">(optional but recommended)</span>
            </label>
            <input
              value={tickerSymbol}
              onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., AAPL, TSLA, GOOGL..."
              maxLength={5}
              className="field"
              disabled={isProcessing}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Helps us show accurate stock charts. We&apos;ll try to guess if left blank.
            </p>
          </div>
          {isProcessing && (
            <div className="mt-4 text-center">
              <div className="mb-2 inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-brand"></div>
              <p className="text-brand">{processingStatus}</p>
            </div>
          )}
          <Link href="#earnings-calls">
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              or choose from our library below <ChevronDown className="size-4" />
            </p>
          </Link>
        </div>
        <hr id="earnings-calls" className="my-7 h-px w-full border-none bg-white/8" />
        <div className="text-center">
          <h3 className="text-4xl font-light tracking-tight">Earnings Call Library</h3>
          <h5 className="mt-3 text-xl font-light text-muted-foreground">Try a call from our demo library.</h5>
        </div>
        <div className="surface rounded-2xl px-6 pt-6 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1000px]">
            {/* Static mock calls */}
            {mockCalls.map((call) => {
              const formattedDate = new Date(call.date).toLocaleDateString(
                "en-US"
              );
              return (
                <Link key={call.id} href={`/dashboard/?id=${call.id}`}>
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-3 text-left transition-colors hover:bg-white/5">
                    <Image
                      src={call.image}
                      alt={`${call.company} Thumbnail`}
                      width={350}
                      height={150}
                      className="w-auto rounded-xl"
                    />
                    <h4 className="mt-3 text-lg font-medium">
                      {call.symbol} (Q{call.quarter}{" "}
                      {call.symbol === "GOOGL" || call.symbol === "SHEL" || call.symbol === "TSLA" || call.symbol === "WMT" ? "2024" : new Date(call.date).getFullYear()})
                    </h4>
                    <p className="text-sm text-muted-foreground">{formattedDate}</p>
                  </div>
                </Link>
              );
            })}
            
            {/* Dynamic library videos from database */}
            {libraryVideos.map((video) => {
              const metadata = video.metadata || {};
              const title = metadata.title || "Earnings Call";
              const ticker = metadata.ticker || "N/A";
              const uploadDate = metadata.upload_date || video.created_at;
              const formattedDate = new Date(uploadDate).toLocaleDateString("en-US");
              
              return (
                <div 
                  key={video.id}
                  className="relative"
                  onMouseEnter={() => setHoveredVideoId(video.video_identifier)}
                  onMouseLeave={() => setHoveredVideoId(null)}
                >
                  <Link href={`/dashboard/?video_url=https://youtube.com/watch?v=${video.video_identifier}&ticker=${ticker}`}>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3 text-left transition-colors hover:bg-white/5">
                      <div className="flex h-[150px] w-full items-center justify-center rounded-xl bg-accent">
                        <div className="p-4 text-center">
                          <h3 className="text-2xl font-light text-brand">{ticker}</h3>
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{title}</p>
                        </div>
                      </div>
                      <h4 className="mt-3 text-lg font-medium">{ticker}</h4>
                      <p className="text-sm text-muted-foreground">{formattedDate}</p>
                    </div>
                  </Link>
                  
                  {/* Delete button on hover */}
                  {hoveredVideoId === video.video_identifier && (
                    <button
                      onClick={(e) => handleDelete(video.video_identifier, e)}
                      className="btn-destructive absolute top-2 right-2 z-10"
                      title="Delete this earnings call"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 w-full text-sm text-muted-foreground">
            <em>Click a video card above. Hover to delete custom uploads.</em>
          </p>
        </div>
      </main>
    </div>
  );
}
