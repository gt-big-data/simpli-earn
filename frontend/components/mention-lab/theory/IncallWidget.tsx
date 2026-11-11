"use client";

import { useState } from "react";
import { LineChart, SERIES, DASH, chartOptions, line, num, pct } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { incallPrice, linspace, poissonIncallPrice } from "@/lib/mention-lab/math";

/** Layer 1: the fair price of "said at least once" while the call runs and the word has not come up. */
export default function IncallWidget() {
  const [mean, setMean] = useState(1);
  const [a, setA] = useState(2);
  const b0 = a / mean; // prior Gamma(a, b0) has mean a / b0
  const taus = linspace(0, 1, 101);
  const data = {
    datasets: [
      line("Known rate (Poisson)", taus.map((t) => ({ x: t, y: poissonIncallPrice(t, mean) })), SERIES.neutral, DASH.dashed),
      line("Uncertain rate (Bayesian filter)", taus.map((t) => ({ x: t, y: incallPrice(t, a, b0) })), SERIES.green),
    ],
  };
  const half = { bayes: incallPrice(0.5, a, b0), pois: poissonIncallPrice(0.5, mean) };

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Slider label="Expected times said on the call (a / b₀)" value={mean} min={0.2} max={4} step={0.1} onChange={setMean} format={num(1)} />
        <Slider label="Confidence in that rate (gamma shape a)" value={a} min={0.3} max={20} step={0.1} onChange={setA} format={num(1)} />
      </div>
      <LineChart
        data={data}
        options={chartOptions<"line">({
          linearX: true,
          x: { title: "Share of the call elapsed in silence", fmt: pct, min: 0, max: 1 },
          y: { title: "Fair YES price", fmt: pct, min: 0, max: 1 },
        })}
      />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Halfway through a silent call: Bayesian {pct(half.bayes)} vs known-rate {pct(half.pois)}. The smaller a, the less sure we were of the
        rate, so the faster silence pulls the price down. As a → ∞ the two curves meet.
      </p>
    </div>
  );
}
