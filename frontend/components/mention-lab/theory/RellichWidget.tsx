"use client";

import { useState } from "react";
import { BarChart, LineChart, SERIES, DASH, chartOptions, cents, line, num, pct } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { pde } from "@/lib/mention-lab/data";
import { linspace, sobolevNorms } from "@/lib/mention-lab/math";

const R = pde.rellich;

/** Why the weak norm: the same-size wiggle costs a lot in L2 and almost nothing in H⁻¹ once it is fast. */
export function NormToy() {
  const [freq, setFreq] = useState(2);
  const [amp, setAmp] = useState(1);
  const grid = linspace(0.05, 0.9, 171);
  const base = grid.map((u) => 0.04 * Math.sin(Math.PI * (u - 0.05) / 0.85));
  const wiggle = grid.map((u) => 0.01 * amp * Math.sin((2 * Math.PI * freq * (u - 0.05)) / 0.85));
  const n = sobolevNorms(wiggle, grid);
  const slow = sobolevNorms(grid.map((u) => 0.01 * amp * Math.sin((2 * Math.PI * (u - 0.05)) / 0.85)), grid);

  const curves = {
    datasets: [
      line("Limit curve", grid.map((u, i) => ({ x: u, y: base[i] })), SERIES.neutral, DASH.dashed),
      line("Limit + a wiggle", grid.map((u, i) => ({ x: u, y: base[i] + wiggle[i] })), SERIES.green),
    ],
  };
  const bars = {
    labels: ["L2 distance", "H⁻¹ distance"],
    datasets: [
      { label: "This wiggle (relative to one slow cycle)", data: [n.L2 / slow.L2, n.Hm1 / slow.Hm1], backgroundColor: SERIES.green, borderRadius: 4, maxBarThickness: 56 },
    ],
  };

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Slider label="Wiggle frequency (cycles across the price range)" value={freq} min={1} max={20} step={1} onChange={setFreq} format={(v) => v.toFixed(0)} />
        <Slider label="Wiggle size (¢)" value={amp} min={0.2} max={2} step={0.1} onChange={setAmp} format={num(1)} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <LineChart
          data={curves}
          options={chartOptions<"line">({ linearX: true, x: { title: "Price", fmt: pct, min: 0.05, max: 0.9 }, y: { title: "Premium", fmt: cents } })}
          height={220}
        />
        <BarChart data={bars} options={chartOptions<"bar">({ legend: false, x: { title: "Norm" }, y: { title: "Distance ÷ one slow cycle", fmt: num(2), min: 0 } })} height={220} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The L2 cost of a wiggle depends only on its size. The H⁻¹ cost falls like 1/frequency: at {freq} cycles it is {(n.Hm1 / slow.Hm1).toFixed(2)}× that of one
        slow cycle. Thin markets put fast noise into each season&rsquo;s curve; H⁻¹ compares shapes and lets that noise go.
      </p>
    </div>
  );
}

function histogram(values: number[], bins = 24) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = (hi - lo) / bins;
  const counts = Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return { lo, w, counts };
}

/** The seasonal premium curves, their limit, and the permutation test of "one limit". */
export function RellichEvidence() {
  const [norm, setNorm] = useState<"Hm1" | "L2">("Hm1");
  const curves = {
    datasets: [
      ...R.seasons.map((s, i) =>
        line(s.season, R.grid.map((u, j) => ({ x: u, y: s.curve[j] })), SERIES.neutral, DASH.solid, { borderWidth: 1, borderColor: "rgba(154,160,166,0.55)", order: 2 + i }),
      ),
      line("Limit (all seasons pooled)", R.grid.map((u, j) => ({ x: u, y: R.limit[j] })), SERIES.green, DASH.solid, { borderWidth: 3, order: 1 }),
    ],
  };
  const null_ = R.null[norm];
  const obs = R.observed[norm];
  const h = histogram([...null_, obs]);
  const obsBin = Math.min(h.counts.length - 1, Math.floor((obs - h.lo) / h.w));
  const hist = {
    labels: h.counts.map((_, i) => (h.lo + (i + 0.5) * h.w).toFixed(3)),
    datasets: [
      {
        label: "Shuffled seasons (green bin holds the observed value)",
        data: h.counts.map((c, i) => (i === obsBin ? c - 1 : c)),
        backgroundColor: h.counts.map((_, i) => (i === obsBin ? SERIES.green : SERIES.neutral)),
        borderRadius: 2,
        maxBarThickness: 28,
      },
    ],
  };
  const histOptions = chartOptions<"bar">({ legend: false, x: { title: `Sum of season-vs-rest distances (${norm === "Hm1" ? "H⁻¹" : "L2"})` }, y: { title: "Shuffles", min: 0 } });

  return (
    <div className="flex flex-col gap-5">
      <div className="surface rounded-2xl p-5">
        <p className="mb-2 text-sm text-muted-foreground">
          Maker premium (short YES at the 07:00 mid, after fee) by price, one thin line per reporting season, {pde.markets.toLocaleString()} markets
        </p>
        <LineChart
          data={curves}
          options={chartOptions<"line">({ linearX: true, x: { title: "Mid price at 07:00 ET", fmt: pct, min: 0.05, max: 0.9 }, y: { title: "Premium per contract", fmt: cents } })}
          height={300}
        />
      </div>
      <div className="surface rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Permutation test: whole events reshuffled across seasons {R.n_boot} times. If the seasons share one limit, the observed spread
            looks like a shuffle.
          </p>
          <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-sm">
            {(["Hm1", "L2"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setNorm(k)}
                className={`cursor-pointer rounded-md px-2.5 py-1 ${norm === k ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}
              >
                {k === "Hm1" ? "H⁻¹" : "L2"}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={hist} options={histOptions} height={240} />
        <p className="mt-3 text-sm text-muted-foreground">
          Observed {obs.toFixed(3)} (green bin); {Math.round(R.p[norm] * R.n_boot)} of {R.n_boot} shuffles are at least as spread, so p ={" "}
          <span className="text-foreground">{R.p[norm].toFixed(2)}</span> ({norm === "Hm1" ? "H⁻¹" : "L2"}). The seasons are consistent with one limit
          in both norms.
        </p>
      </div>
      <div className="surface overflow-x-auto rounded-2xl p-5">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-white/8">
              <th className="py-1.5 pr-3 font-normal">Season</th>
              <th className="py-1.5 pr-3 font-normal">Markets</th>
              <th className="py-1.5 pr-3 font-normal">Events</th>
              <th className="py-1.5 pr-3 font-normal">Mean premium</th>
              <th className="py-1.5 pr-3 font-normal">H¹ norm (bounded?)</th>
              <th className="py-1.5 pr-3 font-normal">L2 to the rest</th>
              <th className="py-1.5 font-normal">H⁻¹ to the rest</th>
            </tr>
          </thead>
          <tbody>
            {R.seasons.map((s) => (
              <tr key={s.season} className="border-b border-white/5 last:border-0">
                <td className="py-1.5 pr-3">{s.season}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.markets}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.events}</td>
                <td className="py-1.5 pr-3 tabular-nums">{cents(s.mean_premium)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.h1_norm.toFixed(3)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.dist_l2.toFixed(4)}</td>
                <td className="py-1.5 tabular-nums">{s.dist_hm1.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
