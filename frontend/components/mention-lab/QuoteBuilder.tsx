"use client";

import { useState } from "react";
import { cents, pct } from "@/components/mention-lab/charts";
import { Slider } from "@/components/mention-lab/ui";
import { atPrice, findings, pde } from "@/lib/mention-lab/data";
import { MAKER_FEE_RATE, caraInverse, fitNegativeBinomial, gammaBand, kalshiFee, nbExceed, poissonExceed } from "@/lib/mention-lab/math";

const F = findings.kalshi.maker_model_filtered;

/** One market, start to finish: fair value, the premium it should pay, and whether to quote it. */
export default function QuoteBuilder() {
  const [countsText, setCountsText] = useState("7, 6, 12, 8, 6, 3");
  const [strike, setStrike] = useState(5);
  const [midCents, setMidCents] = useState(84);

  const counts = countsText.split(/[\s,]+/).filter(Boolean).map(Number);
  const valid = counts.length > 0 && counts.every((c) => Number.isInteger(c) && c >= 0 && c <= 5000);
  const mid = midCents / 100;

  let body: React.ReactNode = <p className="text-sm text-destructive">Enter past counts as whole numbers, e.g. 4, 7, 5.</p>;
  if (valid) {
    const fit = fitNegativeBinomial(counts);
    const fair = nbExceed(strike, fit.r, fit.p);
    // Robust band (single word): rate anywhere in the 10–90% range of its gamma uncertainty
    const alpha = 1 / fit.r;
    const [lo, hi] = gammaBand(fit.mean, alpha);
    const vLo = poissonExceed(strike, lo);
    const vHi = poissonExceed(strike, hi);
    const fee = kalshiFee(mid, MAKER_FEE_RATE);
    const edge = mid - fair;
    const inRange = mid >= 0.05 && mid <= 0.9;
    const historical = atPrice(pde.rellich.limit, mid);
    const caraProb = caraInverse(mid, pde.cara.gamma);

    const verdict = !inRange
      ? { label: "Skip", tone: "text-muted-foreground", why: mid > 0.9 ? "Above 90¢ the premium is gone (−0.9¢ historically)." : "Below 5¢ the tick and fee eat the premium." }
      : edge > 0.04
        ? { label: "Quote: priority", tone: "text-brand", why: `Model more than 4¢ below the mid: historically ${cents(F["model below mid by > 0.04"].mean)} per contract (t ${F["model below mid by > 0.04"].t.toFixed(1)}).` }
        : edge > 0
          ? { label: "Quote", tone: "text-brand", why: `Model below the mid: historically ${cents(F["model below mid by > 0.0"].mean)} per contract (t ${F["model below mid by > 0.0"].t.toFixed(1)}).` }
          : { label: "Skip", tone: "text-muted-foreground", why: "Model at or above the mid: where they agree, selling YES has earned nothing (Q1 ≈ 0)." };

    const rows: [string, string, string][] = [
      ["NB fair value P(N ≥ k)", pct(fair), `mean ${fit.mean.toFixed(1)}, ${fit.nCalls} call${fit.nCalls === 1 ? "" : "s"}`],
      ["Robust band [V⁻, V⁺]", `${pct(vLo)} – ${pct(vHi)}`, "rate at its 10th and 90th percentile"],
      ["Mid − fair", cents(edge), "how far the market sits above the model"],
      ["Probability the price implies at γ̂", pct(caraProb), `CARA inversion, γ̂ = ${pde.cara.gamma.toFixed(2)}`],
      ["Premium at this price (limit curve)", cents(historical), "pooled seasons, after fee"],
      ["Maker fee", cents(-fee).replace("+", ""), "1.75% × P × (1 − P)"],
    ];

    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([a, b, note]) => (
              <tr key={a} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-3 text-foreground/80">{a}</td>
                <td className="py-2 pr-3 font-medium tabular-nums">{b}</td>
                <td className="hidden py-2 text-xs text-muted-foreground sm:table-cell">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs text-muted-foreground">Decision at 07:00 ET</p>
          <p className={`mt-1 text-2xl font-light ${verdict.tone}`}>{verdict.label}</p>
          {verdict.label.startsWith("Quote") && <p className="mt-1 text-sm">Rest a YES offer at {midCents}¢; cancel at the call start.</p>}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{verdict.why}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Counts on the company&rsquo;s past calls</span>
          <input className="field" value={countsText} onChange={(e) => setCountsText(e.target.value)} placeholder="oldest first" />
          <span className="text-xs text-muted-foreground">Default: Apple, &ldquo;AI&rdquo;, last six calls</span>
        </label>
        <Slider label="Strike k (said at least k times)" value={strike} min={1} max={30} step={1} onChange={setStrike} format={(v) => `≥${v}`} />
        <Slider label="Mid price at 07:00 ET" value={midCents} min={1} max={99} step={1} onChange={setMidCents} format={(v) => `${v}¢`} />
      </div>
      {body}
    </div>
  );
}
