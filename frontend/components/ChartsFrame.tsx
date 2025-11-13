"use client";

import { useState, useEffect } from "react";
import SentimentGraph from "./SentimentGraph";
import StockChart from "./StockChart";
import { useSearchParams } from "next/navigation";

// Dashboard configurations - now only for ticker and date
const dashboardConfigs: Record<string, { ticker: string; date: string }> = {
  "1": { ticker: "AAPL", date: "2/2/25" },
  "2": { ticker: "CVS", date: "11/6/24" },
  "3": { ticker: "GOOGL", date: "2/4/25" },
  "4": { ticker: "SHEL", date: "1/30/25" },
  "5": { ticker: "TSLA", date: "1/29/25" },
  "6": { ticker: "WMT", date: "2/20/25" }
};

interface ChartsFrameSentimentGraphProps {
  onTimestampClick: (timestamp: number) => void; // Callback to update video timestamp
}

interface SentimentDataPoint {
  sentence_index: number;
  relevance_0_1: number | null;
  'relevance_-1_1': number | null;
  ma_relevance_0_1: number | null;
  specificity_0_1: number | null;
  'specificity_-1_1': number | null;
  ma_specificity_0_1: number | null;
}

export default function ChartsFrame({ onTimestampClick }: ChartsFrameSentimentGraphProps) {
  const [activeTab, setActiveTab] = useState("stock");
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id");
  const config = dashboardId ? dashboardConfigs[dashboardId] : null;
  
  const [sentimentData, setSentimentData] = useState<{
    relevance: SentimentDataPoint[];
    specificity: SentimentDataPoint[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSentimentData = async () => {
      // Need either dashboardId or videoUrl
      if (!dashboardId && !searchParams.get("video_url")) {
        setSentimentData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const baseUrl = "http://localhost:8001";
        const videoUrl = searchParams.get("video_url");

        // Use the new endpoint that looks up data from the database
        const response = await fetch(`${baseUrl}/sentiment/get-by-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dashboard_id: dashboardId || null,
            video_url: videoUrl || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: response.statusText }));
          throw new Error(errorData.detail || `Failed to fetch sentiment data: ${response.statusText}`);
        }

        const data = await response.json();

        setSentimentData({
          relevance: data.relevance_data.data as SentimentDataPoint[],
          specificity: data.specificity_data.data as SentimentDataPoint[],
        });
      } catch (err) {
        console.error("Error fetching sentiment data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch sentiment data");
        setSentimentData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSentimentData();
  }, [dashboardId, searchParams]);

  const renderTabs = () => {
    const isStock = activeTab === "stock";
    const isSentiment = activeTab === "sentiment";

    return (
      <div className="flex flex-row relative w-full">
        {/* Stock/Indicators Tab */}
        <button
          className={`flex justify-center items-center rounded-tl-[30px] ${
            isStock ? "rounded-tr-[23px]" : "rounded-br-[23px]"
          } w-1/2 h-[40px] ${
            isStock ? "border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative`}
          onClick={() => setActiveTab("stock")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isStock ? "" : "opacity-50"
          }`}>
            Indicators
          </h1>
        </button>

        {/* Sentiment Tab */}
        <button
          className={`flex justify-center items-center rounded-tr-[30px] ${
            isSentiment ? "rounded-tl-[23px]" : "rounded-tl-[23px]"
          } ${
            isSentiment ? "border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative w-1/2 h-[40px]`}
          onClick={() => setActiveTab("sentiment")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isSentiment ? "" : "opacity-50"
          }`}>
            Sentiment
          </h1>
        </button>

        {/* Divider */}
        <div className="absolute top-1/2 left-1/2 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transform rotate-20"></div>
      </div>
    );
  };

  return (
    <div className="flex flex-col text-white w-full h-full max-h-120">
      <div className="bg-white/4 text-white rounded-[30px] w-full h-full border border-white/25 overflow-hidden">
        {renderTabs()}
        
        <div className="flex justify-center items-center w-full h-full overflow-hidden">
          {activeTab === "stock" && (
            <>
              {config ? (
                <StockChart ticker={config.ticker} date={config.date} />
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display stock chart</p>
                  <p className="text-sm mt-2">Please select a valid dashboard</p>
                </div>
              )}
            </>
          )}
          
          {activeTab === "sentiment" && (
            <>
              {loading ? (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Loading sentiment data...</p>
                </div>
              ) : error ? (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Error loading sentiment data</p>
                  <p className="text-sm mt-2">{error}</p>
                </div>
              ) : sentimentData ? (
                <SentimentGraph 
                  relevanceData={sentimentData.relevance}
                  specificityData={sentimentData.specificity}
                  onTimestampClick={onTimestampClick} 
                />
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display sentiment data</p>
                  <p className="text-sm mt-2">Please select a valid dashboard</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}