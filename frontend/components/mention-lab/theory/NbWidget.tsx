"use client";

import { useState } from "react";
import { LineChart, MixedChart, SERIES, DASH, chartOptions, line, num, pct } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { nbExceed, nbFromAlpha, nbPmf, poissonExceed, poissonPmf } from "@/lib/mention-lab/math";

/** Poisson base rate vs Poisson–gamma at the same mean: the count distribution and the strike ladder. */
export default function NbWidget() {
  const [mean, setMean] = useState(6);
  const [alpha, setAlpha] = useState(0.25);
  const { r, p } = nbFromAlpha(mean, alpha);
  const xMax = Math.max(12, Math.ceil(mean + 4 * Math.sqrt(mean + alpha * mean * mean)));
  const xs = Array.from({ length: xMax + 1 }, (_, x) => x);
  const strikes = xs.filter((k) => k >= 1);

  const pmf = {
    labels: xs.map(String),
    datasets: [
      { type: "bar" as const, label: "Poisson–gamma (NB)", data: xs.map((x) => nbPmf(x, r, p)), backgroundColor: SERIES.green, borderRadius: 4, maxBarThickness: 18, order: 2 },
      { type: "line" as const, ...line("Poisson base rate", xs.map((x) => poissonPmf(x, mean)), SERIES.neutral, DASH.dashed, { pointRadius: 2 }), order: 1 },
    ],
  };
  const ladder = {
    labels: strikes.map((k) => `≥${k}`),
    datasets: [
      line("Poisson base rate", strikes.map((k) => poissonExceed(k, mean)), SERIES.neutral, DASH.dashed, { pointRadius: 3 }),
      line("Poisson–gamma (NB)", strikes.map((k) => nbExceed(k, r, p)), SERIES.green, DASH.solid, { pointRadius: 3 }),
    ],
  };
  const near = 1;
  const far = Math.max(2, Math.round(mean * 2));

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Slider label={<>Average count λ̄</>} value={mean} min={0.5} max={20} step={0.5} onChange={setMean} format={num(1)} />
        <Slider label={<>Dispersion α (0 = Poisson)</>} value={alpha} min={0.01} max={1} step={0.01} onChange={setAlpha} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Distribution of the count</p>
          <MixedChart data={pmf as never} options={chartOptions<"bar">({ x: { title: "Times said" }, y: { title: "Probability", fmt: num(2) } })} />
        </div>
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Strike ladder P(N ≥ k), the price of each market</p>
          <LineChart data={ladder} options={chartOptions<"line">({ x: { title: "Strike" }, y: { title: "P(YES)", fmt: pct, min: 0, max: 1 } })} />
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Same mean, different prices. Near-certain strike ≥{near}: Poisson {pct(poissonExceed(near, mean))}, NB{" "}
        {pct(nbExceed(near, r, p))}. Long shot ≥{far}: Poisson {pct(poissonExceed(far, mean))}, NB {pct(nbExceed(far, r, p))}. Poisson
        over-prices the sure things and under-prices the long shots.
      </p>
    </div>
  );
}
