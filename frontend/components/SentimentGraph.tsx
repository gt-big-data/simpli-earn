import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ChartEvent, Chart } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface SentimentDataPoint {
  sentence_index: number;
  relevance_0_1: number | null;
  'relevance_-1_1': number | null;
  ma_relevance_0_1: number | null;
  specificity_0_1: number | null;
  'specificity_-1_1': number | null;
  ma_specificity_0_1: number | null;
}

export interface RedFlagHistoricalPattern {
  direction: "down" | "flat" | "up";
  hit_rate: number;
  sample_size: number;
  summary: string;
}

export interface RedFlag {
  sentence_index: number;
  quote: string;
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  historical_pattern?: RedFlagHistoricalPattern;
}

export interface RedFlagPrediction {
  expected_next_open?: "down" | "flat" | "up" | null;
  reason?: string;
  window?: string;
  threshold_pct?: number;
  flag_volume?: {
    count?: number;
    high?: number;
    medium?: number;
    low?: number;
    weighted_score?: number;
    level?: string;
    summary?: string;
  };
  actual_next_open?: {
    next_open_pct?: number;
    direction?: "down" | "flat" | "up";
    ticker?: string;
    date?: string;
  };
  strategy?: {
    mode?: string;
    action?: string;
    instrument?: string | null;
    timing?: string;
    ticker?: string;
    thesis?: string;
    retrospective?: {
      direction_correct?: boolean;
      actual_direction?: string;
      actual_next_open_pct?: number;
      note?: string;
    } | null;
    disclaimer?: string;
  };
}

interface SentimentGraphProps {
  relevanceData: SentimentDataPoint[];
  specificityData: SentimentDataPoint[];
  redFlags?: RedFlag[];
  redFlagPrediction?: RedFlagPrediction | null;
  onTimestampClick: (timestamp: number) => void;
}

// Utility function to calculate moving average
const calculateMovingAverage = (data: (number | null)[], windowSize: number): (number | null)[] => {
  const movingAverage: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const subset = data.slice(start, i + 1).filter((val): val is number => val !== null);
    if (subset.length > 0) {
      const average = subset.reduce((sum, value) => sum + value, 0) / subset.length;
      movingAverage.push(average);
    } else {
      movingAverage.push(null);
    }
  }
  return movingAverage;
};

// Estimate timestamp from sentence_index (assume ~2 seconds per sentence on average)
const estimateTimestamp = (sentenceIndex: number): number => {
  return sentenceIndex * 2;
};

// Wrap long text into lines that fit in the tooltip (~48 chars per line, break at spaces)
const wrapForTooltip = (text: string, maxCharsPerLine = 48): string[] => {
  if (!text || text.length <= maxCharsPerLine) return text ? [text] : [];
  const lines: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    const chunk = remaining.slice(0, maxCharsPerLine);
    const lastSpace = chunk.lastIndexOf(' ');
    const breakAt = lastSpace > maxCharsPerLine * 0.5 ? lastSpace : maxCharsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  return lines;
};

const SentimentGraph: React.FC<SentimentGraphProps> = ({ relevanceData, specificityData, redFlags = [], redFlagPrediction = null, onTimestampClick }) => {
  // Extract data, using -1_1 scale for both relevance and specificity
  const relevanceValues = relevanceData.map(row => row['relevance_-1_1']);
  const specificityValues = specificityData.map(row => row['specificity_-1_1']);
  
  // Get moving averages if available, otherwise calculate them
  const maRelevanceValues = relevanceData.map(row => row.ma_relevance_0_1 !== null 
    ? row.ma_relevance_0_1 * 2 - 1  // Convert from 0-1 to -1 to 1 scale
    : null
  );
  const maSpecificityValues = specificityData.map(row => row.ma_specificity_0_1 !== null
    ? row.ma_specificity_0_1 * 2 - 1  // Convert from 0-1 to -1 to 1 scale
    : null
  );

  // Fallback to calculated moving average if ma values are not available
  const calculatedMaRelevance = calculateMovingAverage(relevanceValues, 5);
  const calculatedMaSpecificity = calculateMovingAverage(specificityValues, 5);

  // Use sentence_index as x-axis labels
  const sentenceIndices = relevanceData.map(row => row.sentence_index);
  const redFlagBySentence = new Map(redFlags.map(f => [f.sentence_index, f]));

  // Red flag points: only show at sentence indices that have flags
  const redFlagData = sentenceIndices.map((si, idx) => {
    const flag = redFlagBySentence.get(si);
    if (!flag) return null;
    const y = relevanceValues[idx] ?? specificityValues[idx] ?? 0;
    return typeof y === "number" ? y : null;
  });

  const chartData = {
    labels: sentenceIndices.map(String), // Use sentence_index as labels
    datasets: [
      {
        label: 'Relevance',
        data: relevanceValues,
        borderColor: 'rgba(128, 209, 141, 255)',
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(128, 209, 141, 0.2)',
        pointBorderColor: 'rgba(128, 209, 141, 0.2)',
        pointHoverBackgroundColor: 'rgba(128, 209, 141, 255)',
        pointHoverBorderColor: 'rgba(128, 209, 141, 255)',
        showLine: false,
      },
      {
        label: 'Relevance Moving Average',
        data: maRelevanceValues.some(v => v !== null) ? maRelevanceValues : calculatedMaRelevance,
        borderColor: 'rgba(128, 209, 141, 255)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 1,
      },
      {
        label: 'Specificity',
        data: specificityValues,
        borderColor: 'rgba(59, 130, 246, 255)', // Blue color for specificity
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(59, 130, 246, 0.2)',
        pointBorderColor: 'rgba(59, 130, 246, 0.2)',
        pointHoverBackgroundColor: 'rgba(59, 130, 246, 255)',
        pointHoverBorderColor: 'rgba(59, 130, 246, 255)',
        showLine: false,
      },
      {
        label: 'Specificity Moving Average',
        data: maSpecificityValues.some(v => v !== null) ? maSpecificityValues : calculatedMaSpecificity,
        borderColor: 'rgba(59, 130, 246, 255)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 1,
      },
      ...(redFlags.length > 0
        ? [
            {
              label: 'Red Flags',
              data: redFlagData,
              borderColor: 'rgba(239, 68, 68, 255)',
              backgroundColor: 'rgba(239, 68, 68, 0.9)',
              pointRadius: 8,
              pointHoverRadius: 12,
              pointStyle: 'triangle' as const,
              showLine: false,
              order: 0,
            },
          ]
        : []),
    ],
  };

  const options = {
    responsive: true,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: 'rgba(255, 255, 255, 0.8)',
          filter: (item: { text: string }) => {
            return item.text.includes('Moving Average') || item.text === 'Red Flags';
          },
        },
      },
      tooltip: {
        enabled: true,
        padding: 12,
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        footerFont: { size: 11, weight: "bold" as const },
        footerColor: "rgba(129, 209, 141, 0.95)",
        // At a red-flag index, only show the flag tooltip (history was getting clipped
        // under long Relevance + quote lines).
        filter: (item: { dataIndex: number; dataset: { label?: string }; raw: unknown }) => {
          const si = sentenceIndices[item.dataIndex];
          const flagHere = redFlagBySentence.has(si);
          if (flagHere) {
            return item.dataset.label === "Red Flags" && item.raw != null;
          }
          return item.dataset.label !== "Red Flags";
        },
        callbacks: {
          label: (ctx: { dataIndex: number; dataset: { label?: string } }) => {
            if (ctx.dataset.label === "Red Flags") {
              const si = sentenceIndices[ctx.dataIndex];
              const flag = redFlagBySentence.get(si);
              if (flag) {
                const header = `⚠️ ${flag.category.replace(/_/g, " ")} (${flag.severity})`;
                // History near the top so it isn't clipped under the quote
                const hist = flag.historical_pattern
                  ? wrapForTooltip(`History: ${flag.historical_pattern.summary}`)
                  : ["History: not enough past calls for this category yet"];
                const quoteLines = wrapForTooltip(flag.quote);
                if (quoteLines.length > 0) {
                  quoteLines[0] = `"${quoteLines[0]}`;
                  quoteLines[quoteLines.length - 1] = `${quoteLines[quoteLines.length - 1]}"`;
                }
                const descLines = wrapForTooltip(flag.description);
                return [header, ...hist, ...quoteLines, ...descLines];
              }
            }
            return undefined;
          },
          footer: (items: { dataIndex: number; dataset: { label?: string } }[]) => {
            const rf = items.find((i) => i.dataset.label === "Red Flags");
            if (!rf) return "";
            const flag = redFlagBySentence.get(sentenceIndices[rf.dataIndex]);
            const p = flag?.historical_pattern;
            if (!p) return "";
            const dir =
              p.direction === "down" ? "↓ next open"
                : p.direction === "up" ? "↑ next open"
                  : "→ flat open";
            return `${dir} · hit rate ${(p.hit_rate * 100).toFixed(0)}% (n=${p.sample_size})`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Sentence Index',
          color: 'rgba(255, 255, 255, 0.8)',
        },
        grid: {
          display: false,
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.6)',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Score',
          color: 'rgba(255, 255, 255, 0.8)',
        },
        min: -1,
        max: 1,
        ticks: {
          stepSize: 0.5,
          color: 'rgba(255, 255, 255, 0.6)',
        },
        grid: {
          drawBorder: true,
          color: (context: { tick: { value: number } }) => (context.tick.value === 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)'),
          lineWidth: (context: { tick: { value: number } }) => (context.tick.value === 0 ? 2 : 1),
        },
      },
    },
    onClick: (event: ChartEvent, elements: { index: number }[]) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const sentenceIndex = sentenceIndices[index];
        // Estimate timestamp from sentence_index for video navigation
        const estimatedTimestamp = estimateTimestamp(sentenceIndex);
        onTimestampClick(estimatedTimestamp);
      }
    },
  };

  // Custom plugin for vertical line
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart: Chart) => {
      const tooltipModel = chart.tooltip;
      
      if (!tooltipModel || !tooltipModel.opacity) {
        return;
      }
      
      const activeElements = tooltipModel.dataPoints || [];
      
      if (activeElements.length > 0) {
        const ctx = chart.ctx;
        const activePoint = activeElements[0];
        const x = activePoint.element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(128, 209, 141, 0.5)';
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  ChartJS.register(verticalLinePlugin);

  const expected = redFlagPrediction?.expected_next_open;
  const actual = redFlagPrediction?.actual_next_open;
  const strategy = redFlagPrediction?.strategy;
  const volume = redFlagPrediction?.flag_volume;
  const predLabel =
    expected === "down" ? "lean down at next open"
      : expected === "up" ? "lean up at next open"
        : expected === "flat" ? "lean flat at next open"
          : null;
  const actionLabel =
    strategy?.action === "buy_put" ? "Buy PUT (paper)"
      : strategy?.action === "buy_call" ? "Buy CALL (paper)"
        : strategy?.action === "no_trade" ? "No trade"
          : null;

  return (
    <div className="flex flex-col w-full h-full box-border pl-6 pr-6 py-2 gap-1">
      {(predLabel || strategy) && (
        <div className="shrink-0 text-[11px] font-montserrat text-white/75 space-y-0.5">
          {predLabel && (
            <p>
              Predictive signal: flags {predLabel}
              {volume?.summary ? ` · ${volume.summary}` : ""}
              {actual?.next_open_pct != null && actual.direction
                ? ` · actual next open: ${actual.next_open_pct > 0 ? "+" : ""}${actual.next_open_pct.toFixed(2)}% (${actual.direction})`
                : ""}
            </p>
          )}
          {actionLabel && (
            <p className="text-white/85">
              <span className="text-[#81D18D] font-semibold">{actionLabel}</span>
              {strategy?.thesis ? ` — ${strategy.thesis}` : ""}
            </p>
          )}
          {strategy?.retrospective?.note && (
            <p className={strategy.retrospective.direction_correct ? "text-[#81D18D]/70" : "text-red-300/80"}>
              {strategy.retrospective.direction_correct ? "✓" : "✗"} {strategy.retrospective.note}
            </p>
          )}
          <p className="text-white/45">Hover a red triangle for category history · paper strategy only</p>
        </div>
      )}
      <div className="w-full flex-1 min-h-0">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default SentimentGraph;
