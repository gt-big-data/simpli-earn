"use client";

import { useState } from "react";
import { LineChart, SERIES, DASH, chartOptions, line, pct } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { pde } from "@/lib/mention-lab/data";
import { caraCe, linspace } from "@/lib/mention-lab/math";

/** Layer 2: price as the CARA certainty equivalent of a YES; γ < 0 lifts prices above probabilities. */
export default function CaraWidget() {
  const fitted = pde.cara.gamma;
  const [g, setG] = useState(fitted);
  const ps = linspace(0.01, 0.99, 99);
  const data = {
    datasets: [
      line("Price = probability (γ = 0)", ps.map((p) => ({ x: p, y: p })), SERIES.neutral, DASH.dashed),
      line(`Price at γ = ${g.toFixed(2)}`, ps.map((p) => ({ x: p, y: caraCe(p, g) })), SERIES.green),
    ],
  };
  const premium = ps.map((p) => caraCe(p, g) - p);
  const iMax = premium.reduce((best, v, i) => (Math.abs(v) > Math.abs(premium[best]) ? i : best), 0);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-5 max-w-md">
        <Slider label="Risk preference γ (negative = lottery-seeking)" value={g} min={-3} max={3} step={0.05} onChange={setG} />
        <button type="button" onClick={() => setG(fitted)} className="mt-2 cursor-pointer text-xs text-brand underline-offset-2 hover:underline">
          Reset to the γ fitted on Kalshi: {fitted.toFixed(2)} (s.e. {pde.cara.se.toFixed(2)})
        </button>
      </div>
      <LineChart
        data={data}
        options={chartOptions<"line">({
          linearX: true,
          x: { title: "True probability of YES", fmt: pct, min: 0, max: 1 },
          y: { title: "Price", fmt: pct, min: 0, max: 1 },
        })}
      />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        At γ = {g.toFixed(2)} the largest gap between price and probability is {(premium[iMax] * 100).toFixed(1)}¢ at a{" "}
        {pct(ps[iMax])} chance. {g < 0 ? "YES trades rich: whoever sells it collects the gap." : g > 0 ? "YES trades cheap: buyers would be paid to hold it." : "No premium."}
      </p>
    </div>
  );
}
