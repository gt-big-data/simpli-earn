"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Bar, Chart, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

// Validated categorical slots for the dark card surface (all pairs pass the colour-blind and
// normal-vision floors); every line also gets its own dash or point style, so colour is never the
// only cue. Neutral grey is the reference series (Poisson, the market, the other seasons).
export const SERIES = {
  green: "#3fae5f",
  orange: "#d95926",
  blue: "#3987e5",
  neutral: "#9aa0a6",
  ink: "#f5f5f5",
};
export const DASH = { solid: [] as number[], dashed: [6, 4], dotted: [2, 3] };
const GRID = "rgba(255,255,255,0.06)";
const TICK = "#9aa0a6";

export const tooltipStyle = {
  backgroundColor: "#141716",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: 1,
  titleColor: "#f5f5f5",
  bodyColor: "#f5f5f5",
  padding: 10,
};

export type Fmt = (v: number) => string;
export const pct: Fmt = (v) => `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
export const cents: Fmt = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}¢`;
export const num =
  (d = 2): Fmt =>
  (v) =>
    v.toFixed(d);

interface AxisSpec {
  title: string;
  fmt?: Fmt;
  min?: number;
  max?: number;
}

export function chartOptions<T extends "line" | "bar">({
  x,
  y,
  legend = true,
  linearX = false,
}: {
  x: AxisSpec;
  y: AxisSpec;
  legend?: boolean;
  linearX?: boolean;
}): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: "#f5f5f5", usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items: TooltipItem<"line" | "bar">[]) => {
            const v = items[0]?.parsed.x;
            return linearX && x.fmt && typeof v === "number" ? `${x.title}: ${x.fmt(v)}` : (items[0]?.label ?? "");
          },
          label: (ctx: TooltipItem<"line" | "bar">) => {
            const v = ctx.parsed.y;
            return `${ctx.dataset.label}: ${typeof v === "number" && y.fmt ? y.fmt(v) : v}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: linearX ? "linear" : "category",
        min: x.min,
        max: x.max,
        grid: { display: false },
        border: { color: GRID },
        title: { display: true, text: x.title, color: TICK },
        // An explicit `callback: undefined` would replace Chart.js's default label formatter, so only set it when needed
        ticks: { color: TICK, maxRotation: 0, autoSkipPadding: 12, ...(linearX && x.fmt ? { callback: (v: string | number) => x.fmt!(Number(v)) } : {}) },
      },
      y: {
        min: y.min,
        max: y.max,
        grid: { color: GRID },
        border: { display: false },
        title: { display: true, text: y.title, color: TICK },
        ticks: { color: TICK, ...(y.fmt ? { callback: (v: string | number) => y.fmt!(Number(v)) } : {}) },
      },
    },
  } as unknown as ChartOptions<T>; // one options shape serves both chart types
}

export function LineChart({ data, options, height = 260 }: { data: ChartData<"line">; options: ChartOptions<"line">; height?: number }) {
  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

export function BarChart({ data, options, height = 260 }: { data: ChartData<"bar">; options: ChartOptions<"bar">; height?: number }) {
  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

/** Bars with line overlays (datasets carry their own `type`). */
export function MixedChart({ data, options, height = 260 }: { data: ChartData<"bar">; options: ChartOptions<"bar">; height?: number }) {
  return (
    <div style={{ height }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}

/** A line dataset with the house mark specs: 2px line, small points, hover target bigger than the mark. */
export function line(label: string, data: (number | null)[] | { x: number; y: number }[], color: string, dash: number[] = DASH.solid, extra: object = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderDash: dash,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 8,
    tension: 0,
    ...extra,
  };
}
