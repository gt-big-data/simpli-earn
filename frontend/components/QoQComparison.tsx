"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Map dashboard IDs to display names
const TRANSCRIPT_LABELS: Record<string, string> = {
  "1": "Apple Q1 FY2025",
  "2": "CVS Q3 2024",
  "3": "Alphabet Q4 2024",
  "4": "Shell Q4 2024",
  "5": "Tesla Q4 2024",
  "6": "Walmart Q4 FY2025",
  // Apple historical quarters
  "aapl_2024Q4": "Apple Q4 FY2024",
  "aapl_2024Q3": "Apple Q3 FY2024",
  "aapl_2024Q2": "Apple Q2 FY2024",
  "aapl_2024Q1": "Apple Q1 FY2024",
  "aapl_2023Q4": "Apple Q4 FY2023",
};

// When on the Apple dashboard (id=1), default compare options are the historical quarters
const APPLE_QUARTER_IDS = ["aapl_2024Q4", "aapl_2024Q3", "aapl_2024Q2", "aapl_2024Q1", "aapl_2023Q4"];

const HIGH_SIGNAL_WORDS = [
  "AI", "headwinds", "margins", "recession", "growth",
  "guidance", "uncertainty", "challenges", "record", "supply chain",
];
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CompareData {
  current_label: string;
  previous_label: string;
  sentiment: {
    current: number;
    previous: number;
    delta: number;
    direction: "up" | "down" | "flat";
  };
  word_counts: {
    current: Record<string, number>;
    previous: Record<string, number>;
  };
  narrative_shifts: string[];
  error?: string;
}

interface QoQComparisonProps {
  currentId: string | null;
  compareId: string;
  setCompareId: (id: string) => void;
}

export default function QoQComparison({ currentId, compareId, setCompareId }: QoQComparisonProps) {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCurrentId = currentId || "1";

  useEffect(() => {
    if (!compareId) return;

    const fetchComparison = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const res = await fetch(`${apiUrl}/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_id: effectiveCurrentId,
            previous_id: compareId,
          }),
        });

        if (!res.ok) {
          throw new Error(`Request failed: ${res.statusText}`);
        }

        const json: CompareData = await res.json();
        if (json.error) {
          throw new Error(json.error);
        }
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch comparison");
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [effectiveCurrentId, compareId]);

  // If on Apple dashboard, show Apple historical quarters; otherwise show other companies
  const isAppleDashboard = effectiveCurrentId === "1";
  const dropdownOptions = isAppleDashboard
    ? APPLE_QUARTER_IDS.map((id) => [id, TRANSCRIPT_LABELS[id]] as [string, string])
    : Object.entries(TRANSCRIPT_LABELS).filter(
        ([id]) => id !== effectiveCurrentId && !APPLE_QUARTER_IDS.includes(id)
      );

  // Ensure compareId is valid for the current dropdown
  const validIds = dropdownOptions.map(([id]) => id);
  const safeCompareId = validIds.includes(compareId) ? compareId : (validIds[0] ?? "aapl_2024Q4");

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCompareId(e.target.value);
  };

  // ---- Sentiment Delta section ----
  const renderSentimentDelta = () => {
    if (!data) return null;
    const { delta, direction, current, previous } = data.sentiment;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const color =
      direction === "up" ? "#22c55e" : direction === "down" ? "#ef4444" : "#9ca3af";
    const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";

    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <span
          className="text-5xl font-bold font-montserrat"
          style={{ color }}
        >
          {deltaStr}
        </span>
        <div className="flex items-center gap-2">
          {/* Traffic light */}
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm text-white/80">
            Sentiment {arrow} {deltaStr} pts vs. {data.previous_label}
          </span>
        </div>
        <div className="flex gap-6 text-xs text-white/60 mt-1">
          <span>Current: <span className="text-white font-semibold">{current}/10</span></span>
          <span>Previous: <span className="text-white font-semibold">{previous}/10</span></span>
        </div>
      </div>
    );
  };

  // ---- Vocabulary Heatmap (Grouped Bar) ----
  const renderHeatmap = () => {
    if (!data) return null;

    const labels = HIGH_SIGNAL_WORDS;
    const currentCounts = labels.map((w) => data.word_counts.current[w] ?? 0);
    const previousCounts = labels.map((w) => data.word_counts.previous[w] ?? 0);

    const chartData = {
      labels,
      datasets: [
        {
          label: data.current_label,
          data: currentCounts,
          backgroundColor: "rgba(34, 197, 94, 0.7)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 1,
        },
        {
          label: data.previous_label,
          data: previousCounts,
          backgroundColor: "rgba(96, 165, 250, 0.7)",
          borderColor: "rgba(96, 165, 250, 1)",
          borderWidth: 1,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "rgba(255,255,255,0.8)",
            font: { size: 11 },
          },
        },
        title: {
          display: false,
        },
        tooltip: {
          backgroundColor: "rgba(0,0,0,0.8)",
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,0.8)",
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.7)", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "rgba(255,255,255,0.7)", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.08)" },
          title: {
            display: true,
            text: "Occurrences",
            color: "rgba(255,255,255,0.5)",
            font: { size: 10 },
          },
        },
      },
    };

    return (
      <div className="w-full px-4" style={{ height: "200px" }}>
        <Bar data={chartData} options={options} />
      </div>
    );
  };

  // ---- Narrative Shifts ----
  const renderNarrativeShifts = () => {
    if (!data) return null;
    return (
      <div className="px-4 pb-4">
        <h2 className="text-xs font-bold font-montserrat text-white/70 uppercase tracking-widest mb-3">
          Narrative Shifts Detected
        </h2>
        <div className="flex flex-col gap-2">
          {data.narrative_shifts.map((shift, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-white/4 border border-white/10 rounded-[15px] px-4 py-3"
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-white/80">
                {i + 1}
              </span>
              <p className="text-sm text-white/80 leading-snug">{shift}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <span className="text-xs text-white/60 font-montserrat font-semibold whitespace-nowrap">
          Compare with:
        </span>
        <select
          value={safeCompareId}
          onChange={handleDropdownChange}
          className="bg-white/10 border border-white/25 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/40 flex-1"
        >
          {dropdownOptions.map(([id, label]) => (
            <option key={id} value={id} className="bg-gray-900 text-white">
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="text-sm text-white/50 animate-pulse font-montserrat">
            Analyzing transcripts...
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-1 items-center justify-center py-8 px-4">
          <p className="text-sm text-red-400 text-center">{error}</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Divider label */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-montserrat font-semibold">
              Sentiment Delta
            </p>
          </div>

          {/* A. Sentiment Delta Widget */}
          <div className="mx-4 mb-3 bg-white/4 border border-white/10 rounded-[15px]">
            {renderSentimentDelta()}
          </div>

          {/* B. Vocabulary Heatmap */}
          <div className="px-4 pb-1">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-montserrat font-semibold mb-2">
              Vocabulary Heatmap
            </p>
          </div>
          <div className="mx-4 mb-3 bg-white/4 border border-white/10 rounded-[15px] py-3">
            {renderHeatmap()}
          </div>

          {/* C. Narrative Consistency */}
          {renderNarrativeShifts()}
        </>
      )}
    </div>
  );
}
