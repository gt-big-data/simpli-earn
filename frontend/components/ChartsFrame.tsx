"use client";

import { useState, useEffect } from "react";
import SentimentGraph from "./SentimentGraph";
import StockChart from "./StockChart";
import EconomicIndicatorsChart from "./EconomicIndicatorsChart";
import QoQComparison from "./QoQComparison";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL, SENTIMENT_API_BASE_URL } from "@/lib/api-config";
import type { RedFlag } from "./SentimentGraph";
import { PRELOADED_DASHBOARDS } from "@/lib/dashboards";

/** Status of a custom-link processing job (null when there is none / it finished) */
export type PipelineState = { status: string; error?: string };

interface ChartsFrameSentimentGraphProps {
  onTimestampClick: (timestamp: number) => void; // Callback to update video timestamp
  pipeline?: PipelineState | null;
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

type ChartsTab = "stock" | "sentiment" | "compare";
type IndicatorView = "stock" | "VIX" | "TNX" | "DXY";

const NO_RED_FLAGS: RedFlag[] = [];

/** Comparison target a dashboard starts with until the user picks another one. */
function defaultCompareId(dashboardId: string | null): string {
  if (!dashboardId || !QOQ_COMPARE_IDS.has(dashboardId) || dashboardId === "1") return "aapl_2024Q4";
  if (dashboardId.startsWith("aapl_")) {
    return APPLE_QUARTER_ORDER.filter((id) => id !== dashboardId)[0] ?? "aapl_2024Q4";
  }
  const others = (["1", "2", "3", "4", "5", "6"] as const).filter((id) => id !== dashboardId);
  return others[0] ?? "1";
}

export default function ChartsFrame({ onTimestampClick, pipeline = null }: ChartsFrameSentimentGraphProps) {
  const pipelineStatus = pipeline?.status ?? null;
  const [activeTab, setActiveTabState] = useState<ChartsTab>("stock");
  const [indicatorView, setIndicatorViewState] = useState<IndicatorView>("stock");
  // Tabs/indicator views are mounted lazily on first visit, then kept mounted (hidden when inactive)
  const [visitedTabs, setVisitedTabs] = useState<Set<ChartsTab>>(() => new Set(["stock"]));
  const [lastIndicator, setLastIndicator] = useState<Exclude<IndicatorView, "stock"> | null>(null);

  const setActiveTab = (tab: ChartsTab) => {
    setActiveTabState(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  };
  const setIndicatorView = (view: IndicatorView) => {
    setIndicatorViewState(view);
    if (view !== "stock") setLastIndicator(view);
  };
  const tabPanelClass = (tab: ChartsTab, extra: string) =>
    `${activeTab === tab ? "flex" : "hidden"} w-full min-h-0 flex-1 flex-col ${extra}`;
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id");
  const ticker = searchParams.get("ticker"); // Get ticker from URL params
  
  const videoUrlParam = searchParams.get("video_url");
  const preloadedConfig = dashboardId ? PRELOADED_DASHBOARDS[dashboardId] : null;

  // For custom videos, look up the ticker and call date (YouTube upload date) from the RAG API
  // (re-fetched when the processing job's status changes, since the job fills in the metadata)
  const videoInfoKey = !preloadedConfig && videoUrlParam ? `${videoUrlParam}|${pipelineStatus ?? ""}` : null;
  const [videoInfoResult, setVideoInfoResult] = useState<{
    key: string;
    info: { ticker: string | null; date: string | null } | null;
  } | null>(null);
  const videoInfo = videoInfoResult?.info ?? null;
  const videoInfoLoading = videoInfoKey !== null && videoInfoResult?.key !== videoInfoKey;
  useEffect(() => {
    if (!videoInfoKey || !videoUrlParam) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/video-info?video_url=${encodeURIComponent(videoUrlParam)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setVideoInfoResult({ key: videoInfoKey, info: data }); })
      .catch(() => { if (!cancelled) setVideoInfoResult({ key: videoInfoKey, info: null }); });
    return () => { cancelled = true; };
  }, [videoInfoKey, videoUrlParam]);

  // A ticker typed by the user (URL param) wins over the detected one
  const customTicker = ticker && ticker !== "N/A" ? ticker.toUpperCase() : videoInfo?.ticker;
  const config = preloadedConfig
    ?? (customTicker && videoInfo?.date ? { ticker: customTicker, date: videoInfo.date } : null);

  const [sentimentData, setSentimentData] = useState<{
    relevance: SentimentDataPoint[];
    specificity: SentimentDataPoint[];
  } | null>(null);
  const redFlagsVideoUrl = searchParams.get("video_url");
  // No flags until the processing job has produced the sentiment files
  const redFlagsKey =
    (dashboardId || redFlagsVideoUrl) && !pipelineStatus ? `${dashboardId ?? ""}|${redFlagsVideoUrl ?? ""}` : null;
  const [redFlagsResult, setRedFlagsResult] = useState<{ key: string; flags: RedFlag[] } | null>(null);
  const redFlags = redFlagsKey && redFlagsResult?.key === redFlagsKey ? redFlagsResult.flags : NO_RED_FLAGS;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the video exists but relevance/specificity CSVs are not ready yet (user pipeline in progress). */
  const [sentimentNotice, setSentimentNotice] = useState<string | null>(null);
  // The user's comparison pick applies to the dashboard it was made on; others start at their default
  const [compareChoice, setCompareChoice] = useState<{ dashboardId: string | null; id: string } | null>(null);
  const compareId =
    compareChoice && compareChoice.dashboardId === dashboardId ? compareChoice.id : defaultCompareId(dashboardId);
  const setCompareId = (id: string) => setCompareChoice({ dashboardId, id });

  useEffect(() => {
    const fetchSentimentData = async () => {
      // Need either dashboardId or videoUrl
      if (!dashboardId && !searchParams.get("video_url")) {
        setSentimentData(null);
        return;
      }
      // Sentiment files are produced by the processing job; wait for it
      if (pipelineStatus) {
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
      } catch (err) {
        console.error("Error fetching sentiment data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch sentiment data");
        setSentimentData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSentimentData();
  }, [dashboardId, searchParams, pipelineStatus]);

  // Red flags are an LLM call (slow on first run per video), so load them separately:
  // the sentiment graph renders right away and the flags appear on it when ready.
  useEffect(() => {
    if (!redFlagsKey) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/red-flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dashboard_id: dashboardId || null,
        video_url: redFlagsVideoUrl || null,
      }),
    })
      .then((res) => res.json())
      .then((rfData) => { if (!cancelled) setRedFlagsResult({ key: redFlagsKey, flags: rfData.red_flags || [] }); })
      .catch(() => { if (!cancelled) setRedFlagsResult({ key: redFlagsKey, flags: [] }); });
    return () => { cancelled = true; };
  }, [redFlagsKey, dashboardId, redFlagsVideoUrl]);

  const renderTabs = () => {
    const tabs: { id: ChartsTab; label: string }[] = [
      { id: "stock", label: "Indicators" },
      { id: "sentiment", label: "Sentiment" },
      { id: "compare", label: "Compare" },
    ];
    const activeIndex = tabs.findIndex((t) => t.id === activeTab);
    // Width of the S-curve joining an inactive tab's bottom border to the frame's top edge
    const curveWidth = 24;
    // Shared by every moving part of the outline so the pieces stay joined mid-transition
    const motion =
      "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

    const curve = (risesToRight: boolean, visible: boolean) => (
      <svg
        aria-hidden
        width={curveWidth}
        height={40}
        viewBox={`0 0 ${curveWidth} 40`}
        overflow="visible"
        className={`absolute top-0 ${risesToRight ? "left-0" : "right-0"} text-white/8 transition-opacity ${motion} ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <path
          d={
            risesToRight
              ? `M0 39.5 C${curveWidth / 2} 39.5 ${curveWidth / 2} -0.5 ${curveWidth} -0.5`
              : `M0 -0.5 C${curveWidth / 2} -0.5 ${curveWidth / 2} 39.5 ${curveWidth} 39.5`
          }
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        />
      </svg>
    );

    return (
      <div className="flex flex-row relative w-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              className="flex justify-center items-center w-1/3 h-[40px] cursor-pointer relative"
              onClick={() => setActiveTab(tab.id)}
            >
              <h1 className={`flex justify-center items-center font-medium text-xs w-full h-full transition-opacity ${motion} ${
                isActive ? "opacity-100" : "opacity-50"
              }`}>
                {tab.label}
              </h1>
            </button>
          );
        })}

        {/* The outline is drawn as an overlay so it can slide between tabs. The active tab
            has no border of its own (the frame's top border is its top edge); the bottom
            border runs under the inactive tabs on either side of it. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {/* Bottom border left and right of the active tab, scaled from the outer edges */}
          <div
            className={`absolute bottom-0 left-0 h-px w-full bg-white/8 origin-left transition-transform ${motion}`}
            style={{ transform: `scaleX(${activeIndex / 3})` }}
          />
          <div
            className={`absolute bottom-0 right-0 h-px w-full bg-white/8 origin-right transition-transform ${motion}`}
            style={{ transform: `scaleX(${(tabs.length - 1 - activeIndex) / 3})` }}
          />

          {/* S-curves from the neighbouring bottom border up into the frame's top edge.
              SVG keeps the stroke a constant 1px, where CSS corner borders taper to nothing
              at the middle of the curve. The top end sits above the tab bar so it merges
              into (and is clipped under) the frame's border. A curve against the frame's
              outer edge has nothing to join, so it fades out there. */}
          <div
            className={`absolute top-0 left-0 h-full w-1/3 transition-transform ${motion}`}
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            {curve(true, activeIndex > 0)}
            {curve(false, activeIndex < tabs.length - 1)}
          </div>

          {/* Dividers only between two inactive tabs; next to the active tab the S-curve
              forms the transition and a divider would cross it */}
          <div className={`absolute top-1/2 left-1/3 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full rotate-20 transition-opacity ${motion} ${
            activeIndex === 2 ? "opacity-100" : "opacity-0"
          }`} />
          <div className={`absolute top-1/2 left-2/3 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full rotate-20 transition-opacity ${motion} ${
            activeIndex === 0 ? "opacity-100" : "opacity-0"
          }`} />
        </div>
      </div>
    );
  };

  const compareEligible =
    !!dashboardId && QOQ_COMPARE_IDS.has(dashboardId);

  return (
    <div className="flex flex-col text-white w-full h-full min-h-0">
      <div className="surface relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl text-foreground">
        {renderTabs()}
        
        {/* View Selector for Indicators Tab - positioned below tabs */}
        {activeTab === "stock" && config && (
          <div className="flex justify-end items-center px-6 pt-2 pb-2">
            <label htmlFor="indicator-view" className="field-label mr-2">View:</label>
            <select
              value={indicatorView}
              onChange={(e) => setIndicatorView(e.target.value as IndicatorView)}
              id="indicator-view"
              className="field-select"
            >
              <option value="stock">Stock</option>
              <option value="VIX">VIX (Volatility Index)</option>
              <option value="TNX">TNX (10-Year Treasury)</option>
              <option value="DXY">DXY (US Dollar Index)</option>
            </select>
          </div>
        )}
        
        {/* Panels stay mounted after their first visit and are only hidden, so switching
            tabs/views keeps their fetched data and UI state instead of refetching */}
        <div className="flex w-full min-h-0 flex-1 flex-col">
          {visitedTabs.has("stock") && (
            <div className={tabPanelClass("stock", "items-center justify-center overflow-hidden")}>
              {config ? (
                <>
                  <div className={indicatorView === "stock" ? "contents" : "hidden"}>
                    <StockChart ticker={config.ticker} date={config.date} />
                  </div>
                  {lastIndicator && (
                    <div className={indicatorView !== "stock" ? "contents" : "hidden"}>
                      <EconomicIndicatorsChart
                        startLocal={`${config.date} 09:30`}
                        hours={48}
                        interval="5m"
                        initialIndicator={lastIndicator}
                      />
                    </div>
                  )}
                </>
              ) : videoInfoLoading || (pipelineStatus && pipelineStatus !== "failed") ? (
                <div className="text-center text-white/70">
                  <p className="animate-pulse text-lg font-medium">Loading chart…</p>
                  {pipelineStatus && !customTicker && (
                    <p className="text-sm mt-2">Detecting the ticker — this appears when processing finishes.</p>
                  )}
                </div>
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display chart</p>
                  <p className="text-sm mt-2">
                    {videoUrlParam
                      ? !customTicker
                        ? "Couldn't detect a ticker for this call. Re-create the dashboard with a ticker symbol."
                        : "Couldn't determine the call date for this video."
                      : "Please select a valid dashboard"}
                  </p>
                </div>
              )}
            </div>
          )}

          {visitedTabs.has("sentiment") && (
            <div className={tabPanelClass("sentiment", "items-center justify-center overflow-hidden")}>
              {pipelineStatus === "failed" ? (
                <div className="mx-auto max-w-lg px-4 text-center text-white/70">
                  <p className="text-lg font-medium">Processing failed</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{pipeline?.error}</p>
                </div>
              ) : pipelineStatus ? (
                <div className="text-center text-white/70">
                  <p className="animate-pulse text-lg font-medium">Analyzing sentiment…</p>
                  <p className="text-sm mt-2">This appears automatically when processing finishes.</p>
                </div>
              ) : loading ? (
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
            </div>
          )}

          {visitedTabs.has("compare") && (
            <div className={tabPanelClass("compare", "overflow-y-auto overflow-x-hidden")}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
