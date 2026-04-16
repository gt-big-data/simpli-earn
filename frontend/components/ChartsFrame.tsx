"use client";

import { useState, useEffect } from "react";
import SentimentGraph from "./SentimentGraph";
import StockChart from "./StockChart";
import EconomicIndicatorsChart from "./EconomicIndicatorsChart";
import QoQComparison from "./QoQComparison";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL, SENTIMENT_API_BASE_URL } from "@/lib/api-config";
import type { RedFlag } from "./SentimentGraph";

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

/** Dashboard IDs that have on-disk transcripts for `POST /compare` in the RAG API */
const QOQ_COMPARE_IDS = new Set([
  "1", "2", "3", "4", "5", "6",
  "aapl_2024Q4", "aapl_2024Q3", "aapl_2024Q2", "aapl_2024Q1", "aapl_2023Q4",
]);

const APPLE_QUARTER_ORDER = [
  "aapl_2024Q4",
  "aapl_2024Q3",
  "aapl_2024Q2",
  "aapl_2024Q1",
  "aapl_2023Q4",
] as const;

export default function ChartsFrame({ onTimestampClick }: ChartsFrameSentimentGraphProps) {
  const [activeTab, setActiveTab] = useState<"stock" | "sentiment" | "compare">("stock");
  const [indicatorView, setIndicatorView] = useState<"stock" | "VIX" | "TNX" | "DXY">("stock");
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id");
  const ticker = searchParams.get("ticker"); // Get ticker from URL params
  
  // Use config from dashboardConfigs for preloaded dashboards, or create dynamic config for new videos
  let config = dashboardId ? dashboardConfigs[dashboardId] : null;
  
  // For new videos, create a dynamic config if ticker is provided
  if (!config && ticker) {
    config = {
      ticker: ticker.toUpperCase(),
      date: new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
    };
  }
  
  const [sentimentData, setSentimentData] = useState<{
    relevance: SentimentDataPoint[];
    specificity: SentimentDataPoint[];
  } | null>(null);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the video exists but relevance/specificity CSVs are not ready yet (user pipeline in progress). */
  const [sentimentNotice, setSentimentNotice] = useState<string | null>(null);
  const [compareId, setCompareId] = useState("aapl_2024Q4");

  // Default comparison target when switching preloaded dashboard
  useEffect(() => {
    if (!dashboardId || !QOQ_COMPARE_IDS.has(dashboardId)) return;
    if (dashboardId === "1") {
      setCompareId("aapl_2024Q4");
      return;
    }
    if (dashboardId.startsWith("aapl_")) {
      const next = APPLE_QUARTER_ORDER.filter((id) => id !== dashboardId)[0];
      if (next) setCompareId(next);
      return;
    }
    const others = (["1", "2", "3", "4", "5", "6"] as const).filter((id) => id !== dashboardId);
    setCompareId(others[0] ?? "1");
  }, [dashboardId]);

  useEffect(() => {
    const fetchSentimentData = async () => {
      // Need either dashboardId or videoUrl
      if (!dashboardId && !searchParams.get("video_url")) {
        setSentimentData(null);
        return;
      }

      setLoading(true);
      setError(null);
      setSentimentNotice(null);

      try {
        const videoUrl = searchParams.get("video_url");

        // Use the new endpoint that looks up data from the database
        const response = await fetch(`${SENTIMENT_API_BASE_URL}/sentiment/get-by-video`, {
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

        const data = (await response.json()) as {
          relevance_data?: { data?: SentimentDataPoint[] };
          specificity_data?: { data?: SentimentDataPoint[] };
          sentiment_ready?: boolean;
          status_message?: string | null;
        };

        const relevance = (data.relevance_data?.data ?? []) as SentimentDataPoint[];
        const specificity = (data.specificity_data?.data ?? []) as SentimentDataPoint[];
        const hasPoints = relevance.length > 0 || specificity.length > 0;
        const notReady = data.sentiment_ready === false;

        setSentimentData({ relevance, specificity });
        if (!hasPoints && (notReady || data.status_message)) {
          setSentimentNotice(
            data.status_message?.trim() ||
              "Sentiment charts are not available yet. They appear after the analysis pipeline uploads relevance and specificity files."
          );
        } else {
          setSentimentNotice(null);
        }

        // Fetch red flags from RAG API
        try {
          const rfRes = await fetch(`${API_BASE_URL}/red-flags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dashboard_id: dashboardId || null,
              video_url: videoUrl || null,
            }),
          });
          const rfData = await rfRes.json();
          setRedFlags(rfData.red_flags || []);
        } catch {
          setRedFlags([]);
        }
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
    const isCompare = activeTab === "compare";

    return (
      <div className="flex flex-row relative w-full">
        {/* Stock/Indicators Tab */}
        <button
          type="button"
          className={`flex justify-center items-center rounded-tl-[30px] ${
            isStock ? "rounded-tr-[23px]" : "rounded-br-[23px]"
          } w-1/3 h-[40px] ${
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
          type="button"
          className={`flex justify-center items-center ${
            isSentiment ? "rounded-tl-[23px] rounded-tr-[23px] border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative w-1/3 h-[40px]`}
          onClick={() => setActiveTab("sentiment")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isSentiment ? "" : "opacity-50"
          }`}>
            Sentiment
          </h1>
        </button>

        {/* Compare (QoQ) Tab */}
        <button
          type="button"
          className={`flex justify-center items-center rounded-tr-[30px] ${
            isCompare ? "rounded-tl-[23px]" : "rounded-bl-[23px]"
          } w-1/3 h-[40px] ${
            isCompare ? "border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative`}
          onClick={() => setActiveTab("compare")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isCompare ? "" : "opacity-50"
          }`}>
            Compare
          </h1>
        </button>

        <div className="absolute top-1/2 left-1/3 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transform rotate-20" />
        <div className="absolute top-1/2 left-2/3 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transform rotate-20" />
      </div>
    );
  };

  const compareEligible =
    !!dashboardId && QOQ_COMPARE_IDS.has(dashboardId);

  return (
    <div className="flex flex-col text-white w-full h-full max-h-120 min-h-0">
      <div className="bg-white/4 text-white rounded-[30px] w-full h-full border border-white/25 overflow-hidden relative flex min-h-0 flex-col">
        {renderTabs()}
        
        {/* View Selector for Indicators Tab - positioned below tabs */}
        {activeTab === "stock" && config && (
          <div className="flex justify-end items-center px-6 pt-2 pb-2">
            <label className="text-sm font-medium text-white/70 mr-2">View:</label>
            <select
              value={indicatorView}
              onChange={(e) => setIndicatorView(e.target.value as "stock" | "VIX" | "TNX" | "DXY")}
              className="bg-white/10 border border-white/25 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-white/40"
            >
              <option value="stock">Stock</option>
              <option value="VIX">VIX (Volatility Index)</option>
              <option value="TNX">TNX (10-Year Treasury)</option>
              <option value="DXY">DXY (US Dollar Index)</option>
            </select>
          </div>
        )}
        
        <div
          className={`flex w-full min-h-0 flex-1 flex-col ${
            activeTab === "compare"
              ? "overflow-y-auto overflow-x-hidden"
              : "items-center justify-center overflow-hidden"
          }`}
        >
          {activeTab === "stock" && (
            <>
              {config ? (
                <>
                  {indicatorView === "stock" ? (
                    <StockChart ticker={config.ticker} date={config.date} />
                  ) : (
                    <EconomicIndicatorsChart 
                      startLocal={`${config.date} 09:30`}
                      hours={48} 
                      interval="5m"
                      initialIndicator={indicatorView}
                    />
                  )}
                </>
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display chart</p>
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
              ) : sentimentNotice ? (
                <div className="mx-auto max-w-lg px-4 text-center text-white/80">
                  <p className="text-lg font-medium text-white/90">Sentiment not ready</p>
                  <p className="mt-3 text-sm leading-relaxed">{sentimentNotice}</p>
                </div>
              ) : sentimentData &&
                (sentimentData.relevance.length > 0 || sentimentData.specificity.length > 0) ? (
                <SentimentGraph
                  relevanceData={sentimentData.relevance}
                  specificityData={sentimentData.specificity}
                  redFlags={redFlags}
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

          {activeTab === "compare" && (
            <>
              {compareEligible ? (
                <div className="flex min-h-[420px] w-full flex-1 flex-col">
                  <QoQComparison
                    currentId={dashboardId}
                    compareId={compareId}
                    setCompareId={setCompareId}
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-md px-6 py-10 text-center text-white/75">
                  <p className="text-lg font-medium text-white/90">Compare not available</p>
                  <p className="mt-3 text-sm leading-relaxed">
                    Quarter-over-quarter comparison uses preloaded transcripts on the server. Open an
                    earnings call from the library (preset dashboard or Apple historical quarter) to use
                    this tab.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
