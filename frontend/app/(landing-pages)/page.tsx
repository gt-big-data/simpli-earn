"use client";

import Image from "next/image";
import Link from "next/link";
import { FaSearch, FaChevronDown, FaTrash } from "react-icons/fa";
import { TbSend2 } from "react-icons/tb";
import mockCalls from "@/public/data/mock-calls.json";
import { RAG_API_URL, SENTIMENT_API_URL } from "@/lib/api-config";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  // Load library videos from database
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const response = await fetch(`${SENTIMENT_API_URL}/library`);
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
      const response = await fetch(`${RAG_API_URL}/dashboard/create-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          youtube_url: youtubeLink,
          ticker: tickerSymbol.trim().toUpperCase() || undefined
        }),
      });
      
      const data = await response.json();
      const jobId = data.job_id;
      
      setProcessingStatus("Processing video (this may take several minutes)...");
      
      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${RAG_API_URL}/dashboard/job-status/${jobId}`);
          const statusData = await statusResponse.json();
          
          if (statusData.status === "completed") {
            clearInterval(pollInterval);
            setProcessingStatus("Complete! Redirecting...");
            
            // Redirect to dashboard with video URL and ticker
            setTimeout(() => {
              const tickerParam = tickerSymbol.trim()
                ? `&ticker=${encodeURIComponent(tickerSymbol.trim().toUpperCase())}`
                : '';
              router.push(`/dashboard?video_url=${encodeURIComponent(youtubeLink)}${tickerParam}`);
            }, 1000);
          } else if (statusData.status === "failed") {
            clearInterval(pollInterval);
            setProcessingStatus(`Failed: ${statusData.error || "Unknown error"}`);
            setIsProcessing(false);
          } else {
            setProcessingStatus(`Processing: ${statusData.status}...`);
          }
        } catch (error) {
          console.error("Status check failed:", error);
        }
      }, 3000); // Check every 3 seconds
      
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
      await fetch(`${SENTIMENT_API_URL}/library/${videoId}`, {
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
    <div className="-mb-15 bg-[url(/bg.svg)] bg-cover justify-items-center pt-35 md:pt-40 pb-25 md:pb-30 px-8 md:px-12 gap-16 font-[family-name:var(--font-montserrat)]">
      <main className="text-center flex flex-col gap-8 row-start-2 items-center max-w-[1100px]">
        <div className="flex flex-col items-center w-full">
          <hr className="w-full h-1 border-none bg-gradient-to-r from-[rgba(129,209,141,0)] via-[rgba(129,209,141,0.15)] to-[rgba(129,209,141,0)]" />
          <div className="text-green -mt-4.5 px-4 py-1 rounded-full bg-[#131B15] shadow-[0px_0px_6.414px_0px_rgba(129,209,141,0.56)]">
            Investing. Made simple.
          </div>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl/20 font-medium mt-4">
          Turning Earnings Calls Into{" "}
          <span className="font-semibold bg-linear-to-r from-green to-[#426B48] bg-clip-text text-transparent">
            Actionable Insights
          </span>
        </h1>
        <h4 className="text-lg sm:text-xl mb-4">
          Our AI-powered platform <u>simplifies earnings calls</u>, providing
          easy-to-understand summaries, sentiment analysis, and actionable
          insights, helping you make informed financial decisions.
        </h4>
        <div className="w-full text-left justify-items-center rounded-md p-7 bg-[rgba(0, 0, 0, 0.15)] shadow-[0px_0px_7.258px_0px_rgba(129,209,141,0.50)]">
          <h4 className="font-semibold text-lg mb-3 w-full">
            Upload an <span className="text-green">earnings call</span> to get
            started:
          </h4>
          
          {/* YouTube URL Input */}
          <div className="w-full rounded-full bg-[rgba(234, 250, 236, 0.14)] flex items-center mb-3">
            <FaSearch className="ml-3 text-[#808280]" />
            <input
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              placeholder="Paste call link here...."
              className="-ml-7 py-2 px-10 bg-[rgba(234,250,236,0.14)] rounded-full inset-shadow-sm inset-shadow-[rgba(0,0,0,0.25)] w-full"
              disabled={isProcessing}
            />
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !youtubeLink.trim()}
              className="-ml-11"
            >
              <div className={`transition-all bg-green rounded-full px-2 py-1 ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-80'}`}>
                <TbSend2 size={20} className="text-[#2D322E]" />
              </div>
            </button>
          </div>
          
          {/* Ticker Symbol Input (Optional but Recommended) */}
          <div className="w-full mb-2">
            <label className="text-sm text-gray-400 mb-1 block">
              Ticker Symbol <span className="text-green">(optional but recommended)</span>
            </label>
            <input
              value={tickerSymbol}
              onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., AAPL, TSLA, GOOGL..."
              maxLength={5}
              className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg inset-shadow-sm inset-shadow-[rgba(0,0,0,0.25)] text-white placeholder-gray-500"
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-500 mt-1">
              Helps us show accurate stock charts. We&apos;ll try to guess if left blank.
            </p>
          </div>
          {isProcessing && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-green mb-2"></div>
              <p className="text-green">{processingStatus}</p>
            </div>
          )}
          <Link href="#earnings-calls">
            <p className="text-sm sm:text-base transition-all flex items-center gap-2 sm:gap-4 mt-4 opacity-75 hover:opacity-60">
              or choose from our library below <FaChevronDown />
            </p>
          </Link>
        </div>
        <hr
          id="earnings-calls"
          className="w-full my-7 h-1 border-none bg-[linear-gradient(90deg,_rgba(129,209,141,0)_0%,_rgba(129,209,141,0.15)_50%,_rgba(129,209,141,0)_100%)]"
        />
        <div className="grid lg:grid-cols-[1fr_500px_1fr] items-center gap-4">
          <div>
            <Image
              src="left_squares.svg"
              alt=""
              width={260}
              height={150}
              className="hidden lg:block"
            />
          </div>
          <div>
            <h3 className="text-4xl font-bold bg-linear-to-r from-green to-[#426B48] bg-clip-text text-transparent">
              Earnings Call Library
            </h3>
            <h5 className="text-xl mt-3">Try a call from our demo library.</h5>
          </div>
          <div>
            <Image
              src="right_squares.svg"
              alt=""
              width={260}
              height={150}
              className="hidden lg:block"
            />
          </div>
        </div>
        <div className="rounded-lg px-6 pt-6 pb-4 border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.08)] shadow-[0px_0px_8px_0px_rgba(129,209,141,0.25)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1000px]">
            {/* Static mock calls */}
            {mockCalls.map((call) => {
              const formattedDate = new Date(call.date).toLocaleDateString(
                "en-US"
              );
              return (
                <Link key={call.id} href={`/dashboard/?id=${call.id}`}>
                  <div className="transition-all rounded-lg text-left p-3 border border-[rgba(228,243,230,0.25)] bg-[rgba(249,250,249,0.04)] shadow-[0px_0px_4px_0px_rgba(129,209,141,0.50)] hover:-translate-y-1">
                    <Image
                      src={call.image}
                      alt={`${call.company} Thumbnail`}
                      width={350}
                      height={150}
                      className="rounded-md w-auto"
                    />
                    <h4 className="text-lg font-bold mt-3">
                      {call.symbol} (Q{call.quarter}{" "}
                      {call.symbol === "GOOGL" || call.symbol === "SHEL" || call.symbol === "TSLA" || call.symbol === "WMT" ? "2024" : new Date(call.date).getFullYear()})
                    </h4>
                    <p className="text-sm text-gray-400">{formattedDate}</p>
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
                    <div className="transition-all rounded-lg text-left p-3 border border-[rgba(228,243,230,0.25)] bg-[rgba(249,250,249,0.04)] shadow-[0px_0px_4px_0px_rgba(129,209,141,0.50)] hover:-translate-y-1">
                      <div className="w-full h-[150px] bg-gradient-to-br from-[#1a2820] to-[#0d1410] rounded-md flex items-center justify-center">
                        <div className="text-center p-4">
                          <h3 className="text-2xl font-bold text-green">{ticker}</h3>
                          <p className="text-xs text-gray-400 mt-2 line-clamp-2">{title}</p>
                        </div>
                      </div>
                      <h4 className="text-lg font-bold mt-3">{ticker}</h4>
                      <p className="text-sm text-gray-400">{formattedDate}</p>
                    </div>
                  </Link>
                  
                  {/* Delete button on hover */}
                  {hoveredVideoId === video.video_identifier && (
                    <button
                      onClick={(e) => handleDelete(video.video_identifier, e)}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition-all z-10"
                      title="Delete this earnings call"
                    >
                      <FaTrash size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="w-full opacity-60 mt-4">
            <em>Click a video card above. Hover to delete custom uploads.</em>
          </p>
        </div>
      </main>
    </div>
  );
}
