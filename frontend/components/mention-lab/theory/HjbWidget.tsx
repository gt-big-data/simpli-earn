"use client";

import { useMemo, useState } from "react";
import { BarChart, SERIES, chartOptions, num } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { fairValue, robustValue } from "@/lib/mention-lab/math";

const N = [4, 4];
const THETA = [0.3, 1.5]; // a rarely said bucket and a common one

/** Layer 3: short YES on four rare words, optionally hedged with YES on four common ones, under unknown verbosity. */
export default function HjbWidget() {
  const [vLo, setVLo] = useState(0.6);
  const [vHi, setVHi] = useState(1.6);
  // First-order hedge: θ_A e^{-θ_A} / θ_B e^{-θ_B} units of B per unit of A (the d/d ln v of each word's P(said))
  const hedge = (THETA[0] * Math.exp(-THETA[0])) / (THETA[1] * Math.exp(-THETA[1]));

  const rows = useMemo(() => {
    const books: [string, number[]][] = [
      ["Short rare words only", [-1, 0]],
      [`Hedged: + ${hedge.toFixed(2)} long per common word`, [-1, hedge]],
    ];
    return books.map(([label, c]) => {
      const up = robustValue(N, THETA, c, vLo, vHi, true);
      const dn = robustValue(N, THETA, c, vLo, vHi, false);
      return { label, up, dn, fair: fairValue(N, THETA, c), width: up - dn };
    });
  }, [vLo, vHi, hedge]);

  const data = {
    labels: rows.map((r) => r.label),
    datasets: [{ label: "Robust band width V⁺ − V⁻", data: rows.map((r) => r.width), backgroundColor: SERIES.blue, borderRadius: 4, maxBarThickness: 56 }],
  };

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Slider label="Verbosity could be as low as v⁻" value={vLo} min={0.2} max={1} step={0.05} onChange={(v) => setVLo(Math.min(v, vHi))} />
        <Slider label="… or as high as v⁺" value={vHi} min={1} max={2.5} step={0.05} onChange={(v) => setVHi(Math.max(v, vLo))} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <BarChart data={data} options={chartOptions<"bar">({ legend: false, x: { title: "Book" }, y: { title: "Worst-case range of value", fmt: num(2), min: 0 } })} height={240} />
        <table className="self-center text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-normal">Book</th>
              <th className="py-1 pr-3 font-normal">V⁻</th>
              <th className="py-1 pr-3 font-normal">Fair</th>
              <th className="py-1 font-normal">V⁺</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className="border-t border-white/8">
                <td className="py-1.5 pr-3">{i === 0 ? "Unhedged" : "Hedged"}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.dn.toFixed(2)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.fair.toFixed(2)}</td>
                <td className="py-1.5 tabular-nums">{r.up.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The hedge removes {(100 * (1 - rows[1].width / rows[0].width)).toFixed(0)}% of the verbosity range. Values are in contracts (each YES pays 1);
        the HJB is solved on the 5 × 5 lattice of words said, live in your browser.
      </p>
    </div>
  );
}
