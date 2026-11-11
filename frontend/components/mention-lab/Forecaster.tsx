"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { BarChart, LineChart, MixedChart, SERIES, DASH, chartOptions, cents, line, num, pct } from "@/components/mention-lab/charts";
import { Card, Stat } from "@/components/mention-lab/ui";
import { examples } from "@/lib/mention-lab/data";
import {
  blend,
  defaultStrikes,
  fitNbMeanToLadder,
  fitNegativeBinomial,
  nbExceed,
  nbPmf,
  poissonExceed,
  poissonPmf,
  tradeRow,
  walkForward,
} from "@/lib/mention-lab/math";

interface LlmResult {
  status: "ok" | "error" | "unavailable";
  reason?: string;
  model?: string;
  raw?: number[];
  ladder?: number[];
  expectedCount?: number | null;
  rationale?: string;
  cached?: boolean;
  forKey?: string;
}

function parseInts(text: string, min: number, max: number): number[] | string {
  const out: number[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < min || n > max) return `"${part}" is not a whole number from ${min} to ${max}`;
    out.push(n);
  }
  return out;
}

const fmtPct = (p: number | null | undefined) => (p == null ? "–" : p > 0 && p < 0.001 ? "<0.1%" : p < 1 && p > 0.999 ? ">99.9%" : `${(100 * p).toFixed(1)}%`);

export default function Forecaster() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const ex = examples[exampleIdx];
  const [company, setCompany] = useState(ex.company);
  const [word, setWord] = useState(ex.word);
  const [countsText, setCountsText] = useState(ex.counts.join(", "));
  const [labels, setLabels] = useState<string[]>(ex.calls);
  const [windowSize, setWindowSize] = useState(8);
  const [strikesText, setStrikesText] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [spread, setSpread] = useState(2);
  const [minEdge, setMinEdge] = useState(3);
  const [weight, setWeight] = useState(0.1);
  const [context, setContext] = useState("");
  const [llmInfo, setLlmInfo] = useState<{ available: boolean; model: string } | null>(null);
  const [llm, setLlm] = useState<LlmResult | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);

  useEffect(() => {
    fetch("/api/research/mention-markets/llm-ladder")
      .then((r) => r.json())
      .then(setLlmInfo)
      .catch(() => setLlmInfo({ available: false, model: "" }));
  }, []);

  const loadExample = (i: number) => {
    const e = examples[i];
    setExampleIdx(i);
    setCompany(e.company);
    setWord(e.word);
    setCountsText(e.counts.join(", "));
    setLabels(e.calls);
    setStrikesText("");
    setPrices({});
    setLlm(null);
  };

  const model = useMemo(() => {
    const counts = parseInts(countsText, 0, 5000);
    if (typeof counts === "string") return { error: counts };
    if (!counts.length) return { error: "Enter at least one earlier call's count." };
    const strikesIn = parseInts(strikesText, 1, 500);
    if (typeof strikesIn === "string") return { error: strikesIn };
    const callLabels = counts.map((_, i) => labels[i] ?? `Call ${i + 1}`);
    const used = counts.slice(-windowSize);
    const fit = fitNegativeBinomial(used);
    const strikes = strikesIn.length ? [...new Set(strikesIn)].sort((a, b) => a - b).slice(0, 12) : defaultStrikes(fit.mean);
    let xMax = Math.max(strikes[strikes.length - 1] + 2, 5);
    while ((nbExceed(xMax, fit.r, fit.p) > 1e-3 || poissonExceed(xMax, fit.mean) > 1e-3) && xMax < 600) xMax++;
    return { counts, callLabels, used, fit, strikes, xMax, key: `${company}|${word}|${used.join(",")}|${strikes.join(",")}|${context}` };
  }, [countsText, strikesText, labels, windowSize, company, word, context]);

  const askLlm = async () => {
    if ("error" in model) return;
    setLlmLoading(true);
    try {
      const res = await fetch("/api/research/mention-markets/llm-ladder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          word,
          strikes: model.strikes,
          history: model.used.map((count, i) => ({ label: model.callLabels[model.counts.length - model.used.length + i], count })),
          context,
        }),
      });
      setLlm({ ...(await res.json()), forKey: model.key });
    } catch (e) {
      setLlm({ status: "error", reason: (e as Error).message, forKey: model.key });
    } finally {
      setLlmLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="surface h-fit rounded-2xl p-5">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Start from SimpliEarn transcripts</span>
            <select className="field-select h-9" value={exampleIdx} onChange={(e) => loadExample(Number(e.target.value))}>
              {examples.map((e, i) => (
                <option key={`${e.ticker}-${e.word}`} value={i}>
                  {e.company} · {e.word} ({e.counts.length} call{e.counts.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Company</span>
              <input className="field" value={company} maxLength={80} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Word</span>
              <input className="field" value={word} maxLength={120} onChange={(e) => setWord(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Counts on past calls (oldest first)</span>
            <input
              className="field"
              value={countsText}
              onChange={(e) => {
                setCountsText(e.target.value);
                setLabels([]);
              }}
            />
            <span className="text-xs text-muted-foreground">Management speech only; analysts&rsquo; questions don&rsquo;t count.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Recent calls used</span>
              <input className="field" type="number" min={1} max={40} value={windowSize} onChange={(e) => setWindowSize(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Strikes</span>
              <input className="field" value={strikesText} onChange={(e) => setStrikesText(e.target.value)} placeholder="auto" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Spread (¢)</span>
              <input className="field" type="number" min={0} max={50} step={0.5} value={spread} onChange={(e) => setSpread(Number(e.target.value) || 0)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Min edge (¢)</span>
              <input className="field" type="number" min={0} max={50} step={0.5} value={minEdge} onChange={(e) => setMinEdge(Number(e.target.value) || 0)} />
            </label>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-white/8 p-3">
            <legend className="px-1 text-sm font-medium">
              <Bot className="mr-1 inline size-4 text-brand" /> LLM ladder
            </legend>
            {llmInfo && !llmInfo.available && <p className="text-xs text-muted-foreground">Add GEMINI_API_KEY to .env.local and restart the server to enable.</p>}
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Context for the call (optional)</span>
              <textarea className="field h-20 py-2" value={context} maxLength={6000} onChange={(e) => setContext(e.target.value)} placeholder="Paste the press release or recent news." />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">LLM weight in the blend: {weight.toFixed(2)}</span>
              <input type="range" min={0} max={1} step={0.05} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="accent-[var(--brand)]" />
              <span className="text-xs text-muted-foreground">Log-odds mix. Blind LLMs earned weight ≈ 0.03 in the study; keep it small.</span>
            </label>
            <button type="button" className="btn-outline h-9" disabled={!llmInfo?.available || llmLoading || "error" in model} onClick={askLlm}>
              {llmLoading ? <Loader2 className="size-4 animate-spin" /> : `Ask ${llmInfo?.model || "the LLM"}`}
            </button>
            {llm && !("error" in model) && llm.forKey !== model.key && <p className="text-xs text-muted-foreground">Inputs changed since the last answer; ask again.</p>}
          </fieldset>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-6">
        {"error" in model ? (
          <Card>
            <p className="text-sm text-destructive">{model.error}</p>
          </Card>
        ) : (
          <Results model={model} llm={llm} weight={weight} prices={prices} setPrices={setPrices} spread={spread} minEdge={minEdge} word={word} windowSize={windowSize} />
        )}
      </div>
    </div>
  );
}

type Model = {
  counts: number[];
  callLabels: string[];
  used: number[];
  fit: ReturnType<typeof fitNegativeBinomial>;
  strikes: number[];
  xMax: number;
  key: string;
};

function Results({
  model,
  llm,
  weight,
  prices,
  setPrices,
  spread,
  minEdge,
  word,
  windowSize,
}: {
  model: Model;
  llm: LlmResult | null;
  weight: number;
  prices: Record<string, string>;
  setPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  spread: number;
  minEdge: number;
  word: string;
  windowSize: number;
}) {
  const { fit, strikes, counts, callLabels, xMax } = model;
  const llmOk = llm?.status === "ok" && llm.forKey === model.key && llm.ladder;
  const nbLadder = strikes.map((k) => nbExceed(k, fit.r, fit.p));
  const finalLadder = llmOk ? nbLadder.map((p, i) => blend(p, llm!.ladder![i], weight)) : nbLadder;
  const trades = strikes
    .map((k, i) => {
      const t = Number(prices[String(k)]);
      return prices[String(k)]?.trim() && t >= 1 && t <= 99 ? tradeRow(k, finalLadder[i], t / 100, spread / 100, minEdge / 100) : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const tradeBy = new Map(trades.map((t) => [t.strike, t]));
  const wf = walkForward(counts, callLabels, windowSize);
  const wfSum = wf.reduce((a, r) => ({ nb: a.nb + r.nbLogScore, po: a.po + r.poissonLogScore }), { nb: 0, po: 0 });
  const xs = Array.from({ length: xMax + 1 }, (_, x) => x);

  return (
    <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Calls in the fit" value={String(fit.nCalls)} note={`of ${counts.length}`} />
          <Stat label="Expected count" value={fit.mean.toFixed(1)} note={`“${word}”`} />
          <Stat label="Variance ÷ mean" value={(fit.variance / fit.mean).toFixed(2)} note="Poisson assumes 1.00" />
          <Stat
            label="LLM"
            value={llmOk ? fitNbMeanToLadder(strikes, llm!.ladder!, fit.r).toFixed(1) : llm?.status === "error" && llm.forKey === model.key ? "Error" : "Off"}
            note={llmOk ? "mean implied by its ladder" : llm?.forKey === model.key && llm?.reason ? llm.reason.slice(0, 80) : "not asked"}
          />
        </div>

        <Card title={`Mentions of “${word}” by call`}>
          <BarChart
            data={{ labels: callLabels, datasets: [{ label: "Mentions", data: counts, backgroundColor: SERIES.green, borderRadius: 4, maxBarThickness: 36 }] }}
            options={chartOptions<"bar">({ legend: false, x: { title: "Call" }, y: { title: "Mentions", min: 0 } })}
            height={200}
          />
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
          <Card title="Next call: distribution">
            <MixedChart
              data={{
                labels: xs.map(String),
                datasets: [
                  { type: "bar", label: "Poisson–gamma (NB)", data: xs.map((x) => nbPmf(x, fit.r, fit.p)), backgroundColor: SERIES.green, borderRadius: 4, maxBarThickness: 18, order: 2 },
                  { type: "line", ...line("Poisson base rate", xs.map((x) => poissonPmf(x, fit.mean)), SERIES.neutral, DASH.dashed), order: 1 },
                ] as never,
              }}
              options={chartOptions<"bar">({ x: { title: "Times said" }, y: { title: "Probability", fmt: num(2) } })}
            />
          </Card>
          <Card title="Strike ladder P(N ≥ k)">
            <LineChart
              data={{
                labels: strikes.map((k) => `≥${k}`),
                datasets: [
                  line("Poisson base rate", strikes.map((k) => poissonExceed(k, fit.mean)), SERIES.neutral, DASH.dashed, { pointRadius: 3 }),
                  line("Poisson–gamma (NB)", nbLadder, SERIES.green, DASH.solid, { pointRadius: 3 }),
                  ...(llmOk
                    ? [
                        line("LLM ladder", llm!.ladder!, SERIES.orange, DASH.dotted, { pointRadius: 4, pointStyle: "rectRot" }),
                        line(`Blend (w = ${weight.toFixed(2)})`, finalLadder, SERIES.blue, DASH.solid, { pointRadius: 4, pointStyle: "triangle", borderWidth: 3 }),
                      ]
                    : []),
                  ...(trades.length
                    ? [line("Market", strikes.map((k) => tradeBy.get(k)?.market ?? null), SERIES.ink, DASH.solid, { showLine: false, pointRadius: 6, pointStyle: "crossRot" })]
                    : []),
                ],
              }}
              options={chartOptions<"line">({ x: { title: "Strike" }, y: { title: "P(YES)", fmt: pct, min: 0, max: 1 } })}
            />
          </Card>
        </div>

        <Card title="Strikes, fair values and trades">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-white/8">
                  <th className="py-2 pr-3 font-normal">Strike</th>
                  <th className="py-2 pr-3 font-normal">Poisson</th>
                  <th className="py-2 pr-3 font-normal">NB</th>
                  {llmOk && <th className="py-2 pr-3 font-normal">LLM</th>}
                  <th className="py-2 pr-3 font-normal">Fair</th>
                  <th className="py-2 pr-3 font-normal">Market ¢</th>
                  <th className="py-2 pr-3 font-normal">Implied λ</th>
                  <th className="py-2 font-normal">Best action (EV per $1, after fees)</th>
                </tr>
              </thead>
              <tbody>
                {strikes.map((k, i) => {
                  const t = tradeBy.get(k);
                  return (
                    <tr key={k} className="border-b border-white/5 last:border-0">
                      <td className="py-2 pr-3 font-medium">≥{k}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{fmtPct(poissonExceed(k, fit.mean))}</td>
                      <td className="py-2 pr-3">{fmtPct(nbLadder[i])}</td>
                      {llmOk && <td className="py-2 pr-3">{fmtPct(llm!.ladder![i])}</td>}
                      <td className="py-2 pr-3 font-medium">{fmtPct(finalLadder[i])}</td>
                      <td className="py-2 pr-3">
                        <input
                          className="field h-8 px-2"
                          style={{ width: "4.5rem" }}
                          inputMode="decimal"
                          aria-label={`Market price for at least ${k}, cents`}
                          value={prices[String(k)] ?? ""}
                          onChange={(e) => setPrices((p) => ({ ...p, [String(k)]: e.target.value }))}
                          placeholder="–"
                        />
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{t?.impliedLambda != null ? t.impliedLambda.toFixed(2) : "–"}</td>
                      <td className="py-2">
                        {t ? (
                          <span className={t.suggestion === "No trade" ? "text-muted-foreground" : "text-brand"}>
                            {t.suggestion}
                            {t.suggestion !== "No trade" && ` · ${cents(t.suggestionEv)}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">enter a price</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Type each market&rsquo;s mid; everything updates as you type. Implied λ is the Poisson rate a price assumes. Fees: taker 7% × P × (1 − P),
            maker 1.75% × P × (1 − P). Maker values assume a fill at the mid.
          </p>
        </Card>

        {llm && llm.forKey === model.key && (
          <Card title="LLM ladder">
            {llmOk ? (
              <p className="text-sm leading-relaxed text-foreground/85">
                <span className="text-muted-foreground">
                  {llm.model}
                  {llm.cached ? " (cached)" : ""}, never shown market prices. Ladder made non-increasing, then blended in log-odds at weight{" "}
                  {weight.toFixed(2)}.{" "}
                </span>
                {llm.rationale}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{llm.reason}</p>
            )}
          </Card>
        )}

        <Card title="Walk-forward check">
          {wf.length ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Each call forecast from only the calls before it. Total log score (higher is better): NB{" "}
                <span className="text-foreground">{wfSum.nb.toFixed(2)}</span>, Poisson <span className="text-foreground">{wfSum.po.toFixed(2)}</span>.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-white/8">
                      <th className="py-1.5 pr-3 font-normal">Call</th>
                      <th className="py-1.5 pr-3 font-normal">Forecast mean</th>
                      <th className="py-1.5 pr-3 font-normal">Actual</th>
                      <th className="py-1.5 pr-3 font-normal">NB log score</th>
                      <th className="py-1.5 font-normal">Poisson log score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wf.map((r) => (
                      <tr key={r.label} className="border-b border-white/5 last:border-0">
                        <td className="py-1.5 pr-3">{r.label}</td>
                        <td className="py-1.5 pr-3">{r.forecastMean.toFixed(1)}</td>
                        <td className="py-1.5 pr-3">{r.actual}</td>
                        <td className="py-1.5 pr-3">{r.nbLogScore.toFixed(2)}</td>
                        <td className="py-1.5">{r.poissonLogScore.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Needs at least two calls.</p>
          )}
        </Card>
    </>
  );
}
