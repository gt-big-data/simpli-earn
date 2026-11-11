"use client";

import { useState } from "react";
import { BarChart, LineChart, SERIES, DASH, chartOptions, cents, line, num, pct } from "@/components/mention-lab/charts";
import { Card } from "@/components/mention-lab/ui";
import { findings, pde } from "@/lib/mention-lab/data";

const K = findings.kalshi;
const tStat = (t: number) => `t ${t >= 0 ? "+" : "−"}${Math.abs(t).toFixed(1)}`;

export function CalibrationChart() {
  const rows = K.calibration.filter((r) => r.n >= 20);
  const data = {
    datasets: [
      line("Price = probability", [{ x: 0, y: 0 }, { x: 1, y: 1 }], SERIES.neutral, DASH.dashed),
      line("Realized YES rate", rows.map((r) => ({ x: r.price, y: r.realized })), SERIES.green, DASH.solid, { pointRadius: 4 }),
    ],
  };
  return (
    <Card title="Prices vs outcomes">
      <LineChart
        data={data}
        options={chartOptions<"line">({ linearX: true, x: { title: "Mid price at 07:00 ET", fmt: pct, min: 0, max: 1 }, y: { title: "Share that settled YES", fmt: pct, min: 0, max: 1 } })}
        height={300}
      />
      <p className="mt-3 text-sm text-muted-foreground">
        {K.markets.toLocaleString()} markets, {K.events} calls, {K.companies} companies. Points below the diagonal are markets where YES settled
        less often than its price implied. Across 5–90¢ that is most of them: YES buyers overpay by about 4 points.
      </p>
    </Card>
  );
}

export function TradeTable() {
  const rows: [string, { contracts: number; events: number; mean: number; t: number }, string][] = [
    ...Object.entries(K.taker_rules).map(([k, v]) => [`Taker: ${k}`, v, "pay spread + 7% fee"] as [string, typeof v, string]),
    ["Maker: rest a YES offer at the mid (5–90¢)", K.maker.all, "the strategy"],
    ["   … before April 2026", K.maker.before_2026_04, ""],
    ["   … from April 2026", K.maker.from_2026_04, ""],
    ["Maker: same, but mids above 90¢", K.maker["price_above_0.90"], "skip these"],
  ];
  return (
    <Card title="Every way to trade it, after fees">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-white/8">
              <th className="py-1.5 pr-3 font-normal">Rule</th>
              <th className="py-1.5 pr-3 font-normal">Contracts</th>
              <th className="py-1.5 pr-3 font-normal">Calls</th>
              <th className="py-1.5 pr-3 font-normal">Per $1 contract</th>
              <th className="py-1.5 pr-3 font-normal">t (by call)</th>
              <th className="py-1.5 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, s, note]) => (
              <tr key={label} className={`border-b border-white/5 last:border-0 ${note === "the strategy" ? "text-brand" : ""}`}>
                <td className="py-1.5 pr-3 whitespace-pre">{label}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.contracts.toLocaleString()}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.events}</td>
                <td className="py-1.5 pr-3 tabular-nums">{cents(s.mean)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.t.toFixed(1)}</td>
                <td className="py-1.5 text-xs text-muted-foreground">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Taking liquidity does not work: the bias is smaller than the spread plus the 7% × P(1 − P) taker fee. Providing it does: the maker fee is
        1.75% × P(1 − P). t-statistics treat each call as one observation, so one call&rsquo;s words are not counted as independent bets.
      </p>
    </Card>
  );
}

export function MonthlyChart() {
  const rows = K.maker_by_month;
  const data = {
    labels: rows.map((r) => r.month),
    datasets: [{ label: "Maker premium", data: rows.map((r) => r.pnl), backgroundColor: rows.map((r) => (r.pnl >= 0 ? SERIES.green : SERIES.orange)), borderRadius: 4, maxBarThickness: 28 }],
  };
  const opts = chartOptions<"bar">({ legend: false, x: { title: "Month of call" }, y: { title: "Per contract", fmt: cents } });
  opts.plugins!.tooltip!.callbacks!.afterLabel = (ctx) => `${rows[ctx.dataIndex].contracts} contracts`;
  const positive = rows.filter((r) => r.pnl > 0).length;
  return (
    <Card title="Month by month">
      <BarChart data={data} options={opts} height={260} />
      <p className="mt-3 text-sm text-muted-foreground">
        Positive in {positive} of {rows.length} months{positive < rows.length ? "; orange bars are losing months" : ""}. Bars are the mean per contract
        that month, so thin months are noisy.
      </p>
    </Card>
  );
}

export function QuintileChart() {
  const rows = K.maker_by_model_quintile;
  const data = {
    labels: rows.map((r) => `Q${r.quintile} (${cents(r.mean_edge)})`),
    datasets: [{ label: "Maker premium", data: rows.map((r) => r.mean), backgroundColor: SERIES.green, borderRadius: 4, maxBarThickness: 48 }],
  };
  const opts = chartOptions<"bar">({ legend: false, x: { title: "Quintile of mid − model fair (walk-forward)" }, y: { title: "Per contract", fmt: cents } });
  opts.plugins!.tooltip!.callbacks!.afterLabel = (ctx) => `${tStat(rows[ctx.dataIndex].t)}, ${rows[ctx.dataIndex].contracts} contracts`;
  const f = K.maker_model_filtered;
  return (
    <Card title="The model picks where to quote">
      <BarChart data={data} options={opts} height={260} />
      <p className="mt-3 text-sm text-muted-foreground">
        Markets ranked by how far the walk-forward model sits below the mid. Where model and mid agree (Q1), selling YES earns nothing; where the
        model is furthest below, {cents(rows[rows.length - 1].mean)} ({tStat(rows[rows.length - 1].t)}). The middle is noisy (Q3 earns about
        nothing), so read the model as a ranking of the extremes, not a precise price. Quoting only where the model is more
        than 4¢ below the mid: {cents(f["model below mid by > 0.04"].mean)} on {f["model below mid by > 0.04"].contracts.toLocaleString()} contracts (
        {tStat(f["model below mid by > 0.04"].t)}).
      </p>
    </Card>
  );
}

export function LlmTable() {
  const L = findings.llm;
  const rows: [string, { brier: number; logloss: number }][] = [
    ["Market mid", L["market mid"]],
    ["Base-rate model", L["model: base rates"]],
    ["LLM, scored blind", L.LLM],
  ];
  return (
    <Card title="Does an LLM add information?">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-white/8">
            <th className="py-1.5 pr-3 font-normal">Forecaster</th>
            <th className="py-1.5 pr-3 font-normal">Brier</th>
            <th className="py-1.5 font-normal">Log loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([n, s]) => (
            <tr key={n} className="border-b border-white/5 last:border-0">
              <td className="py-1.5 pr-3">{n}</td>
              <td className="py-1.5 pr-3 tabular-nums">{s.brier.toFixed(3)}</td>
              <td className="py-1.5 tabular-nums">{s.logloss.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-muted-foreground">
        {L.markets.toLocaleString()} markets on {L.events} calls from {L.first_call}, after the model&rsquo;s training cutoff, priced zero-shot without
        seeing prices. Stacked with the market, the LLM earns weight {L.stacking.weight_llm.toFixed(2)} ({tStat(L.stacking.t_llm)}), and trading
        its 5¢ disagreements loses {Math.abs(100 * L.taker_on_llm_edge_5c.mean).toFixed(1)}¢ per contract. On its own it is not an edge, so the Forecaster blends it with a
        small, user-set weight. The likeliest place for one is the earnings press release, which is posted minutes before the call.
      </p>
    </Card>
  );
}

export function TranscriptChart() {
  const [k, setK] = useState<"k1" | "k3" | "k10">("k3");
  const rows = findings.lambda[k].filter((r) => r.n >= 100);
  const data = {
    labels: rows.map((r) => r.bucket),
    datasets: [
      line("Realized", rows.map((r) => r.realized), SERIES.green, DASH.solid, { pointRadius: 4 }),
      line("NB model", rows.map((r) => r.nb_model), SERIES.blue, DASH.dotted, { pointRadius: 4, pointStyle: "triangle" }),
      line("Poisson base rate", rows.map((r) => r.poisson), SERIES.neutral, DASH.dashed, { pointRadius: 4, pointStyle: "rectRot" }),
    ],
  };
  const brier = findings.lambda[`brier_${k}` as const];
  return (
    <Card title="Transcripts: NB vs Poisson, before any market">
      <div className="mb-3 flex gap-1 rounded-lg border border-white/10 p-0.5 text-sm" style={{ width: "fit-content" }}>
        {(["k1", "k3", "k10"] as const).map((key) => (
          <button key={key} type="button" onClick={() => setK(key)} className={`cursor-pointer rounded-md px-2.5 py-1 ${k === key ? "bg-white/10" : "text-muted-foreground"}`}>
            ≥{key.slice(1)}
          </button>
        ))}
      </div>
      <LineChart data={data} options={chartOptions<"line">({ x: { title: "Forecast bucket" }, y: { title: "P(said ≥ k)", fmt: pct, min: 0 } })} height={260} />
      <p className="mt-3 text-sm text-muted-foreground">
        {findings.lambda.rows.toLocaleString()} company-word pairs. Brier: NB {brier.nb_model.toFixed(4)}, Poisson {brier.poisson.toFixed(4)}. In the
        low buckets, where most words sit, Poisson&rsquo;s long-shot probabilities are too small; the NB is closer.
      </p>
    </Card>
  );
}

export function CaraSeasons() {
  const s = pde.cara.by_season;
  const data = {
    labels: s.map((r) => r.season),
    datasets: [{ label: "Fitted γ", data: s.map((r) => r.gamma), backgroundColor: SERIES.blue, borderRadius: 4, maxBarThickness: 40 }],
  };
  const opts = chartOptions<"bar">({ legend: false, x: { title: "Season" }, y: { title: "γ (negative = lottery-seeking)", fmt: num(2) } });
  opts.plugins!.tooltip!.callbacks!.afterLabel = (ctx) => `s.e. ${s[ctx.dataIndex].se.toFixed(2)}, ${s[ctx.dataIndex].markets} markets`;
  return (
    <Card title="Risk preference by season">
      <BarChart data={data} options={opts} height={240} />
      <p className="mt-3 text-sm text-muted-foreground">
        Pooled γ̂ = {pde.cara.gamma.toFixed(2)} (s.e. {pde.cara.se.toFixed(2)}). Every season is negative, and the latest are closest to zero.
      </p>
    </Card>
  );
}
