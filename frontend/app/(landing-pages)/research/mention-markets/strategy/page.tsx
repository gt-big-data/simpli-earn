import type { Metadata } from "next";
import Link from "next/link";
import QuoteBuilder from "@/components/mention-lab/QuoteBuilder";
import { Callout, PageHeader, Prose, Section, Stat } from "@/components/mention-lab/ui";
import { findings, pde } from "@/lib/mention-lab/data";

export const metadata: Metadata = { title: "Strategy | SimpliEarn" };

const c = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(1)}¢`;

export default function StrategyPage() {
  const K = findings.kalshi;
  const F = K.maker_model_filtered;
  const q5 = K.maker_by_model_quintile[K.maker_by_model_quintile.length - 1];
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-20">
      <PageHeader eyebrow="Strategy" title="Sell the lottery, before the call">
        Market-make Kalshi earnings-mention markets from the short side: rest offers to sell YES at the mid on the morning of the call, where the
        negative binomial says the price is too high, and let the YES buyers&rsquo; lottery premium pay you.
      </PageHeader>

      <div className="mb-12 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="All 5–90¢ markets" value={c(K.maker.all.mean)} note={`per contract, t ${K.maker.all.t.toFixed(1)}`} />
        <Stat label="Model > 4¢ below mid" value={c(F["model below mid by > 0.04"].mean)} note={`t ${F["model below mid by > 0.04"].t.toFixed(1)}, ${F["model below mid by > 0.04"].contracts.toLocaleString()} contracts`} />
        <Stat label="Top model quintile" value={c(q5.mean)} note={`t ${q5.t.toFixed(1)}`} />
        <Stat label="Since April 2026" value={c(K.maker.from_2026_04.mean)} note={`t ${K.maker.from_2026_04.t.toFixed(1)} (was ${c(K.maker.before_2026_04.mean)})`} />
      </div>

      <div className="flex flex-col gap-16">
        <Section id="rules" number="1" title="The rules">
          <ol className="flex max-w-3xl list-none flex-col gap-3 p-0">
            {[
              ["When", "07:00 ET on the call date, once. Cancel anything unfilled when the call starts."],
              ["Which markets", "Every earnings-mention market whose mid is between 5¢ and 90¢. Above 90¢ the premium is gone; below 5¢ the fee and tick eat it."],
              ["Fair value", "Negative binomial P(N ≥ k) from the company's own transcript history (management speech only), with Kalshi's earlier listings of the same word as a fallback."],
              ["Quote", "Rest an offer to sell YES at the mid wherever the model is below it; first where it is more than 4¢ below. Skip where the model is at or above the mid."],
              ["Never", "Take liquidity (it loses after spread and the 7% fee), quote into a live call (silence reprices you), or hedge verbosity across words (it costs more than it saves)."],
              ["Size", "Equal size per market, spread across as many calls as possible. Words on one call barely co-move (ρ = " + pde.within_event_rho.toFixed(3) + "), so calls are the unit of diversification."],
            ].map(([t, d], i) => (
              <li key={t} className="surface flex gap-4 rounded-2xl p-4">
                <span className="text-2xl font-light text-brand">{i + 1}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="text-sm leading-relaxed text-foreground/80">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="why" number="2" title="Why each rule">
          <Prose>
            <p>
              Each rule comes from a result on the <Link href="/research/mention-markets/theory">Theory</Link> page and a number on the <Link href="/research/mention-markets/evidence">Evidence</Link> page.
            </p>
          </Prose>
          <div className="surface overflow-x-auto rounded-2xl p-5">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-white/8">
                  <th className="py-2 pr-4 font-normal">Rule</th>
                  <th className="py-2 pr-4 font-normal">Theory</th>
                  <th className="py-2 font-normal">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Sell YES, don't buy it", "CARA pricing PDE: γ < 0 puts prices above probabilities", `γ̂ = ${pde.cara.gamma.toFixed(2)} (s.e. ${pde.cara.se.toFixed(2)}); mid ≈ 4 points above the YES rate across 5–90¢`],
                  ["Use the NB, not a base rate", "Poisson–gamma mixture; Jensen gap in both tails", `Top model quintile ${c(q5.mean)} vs ≈ 0 where model and mid agree`],
                  ["Quote, don't take", "The premium is smaller than spread + taker fee", `Taker rules ${c(K.taker_rules["buy NO, price 0.40-0.80"].mean)} to ${c(K.taker_rules["buy YES, price <= 0.10"].mean)}; maker ${c(K.maker.all.mean)}`],
                  ["Quote before the call only", "In-call filter PDE: silence lowers the fair price faster than a Poisson clock", "Snapshot at 07:00 ET; prices later in the day can be inside the call"],
                  ["Don't hedge verbosity", "Robust HJB: a β-hedge narrows the band only if the common factor matters", `ρ = ${pde.within_event_rho.toFixed(3)}; hedged ${pde.hedge_reported.beta_neutral_c.toFixed(1)}¢ vs unhedged ${pde.hedge_reported.unhedged_c.toFixed(1)}¢`],
                  ["Estimate from the pooled past", "Rellich–Kondrachov: bounded premium curves are precompact; tested for a single limit", `Seasons vs shuffles: p = ${pde.rellich.p.Hm1.toFixed(2)} (H⁻¹), ${pde.rellich.p.L2.toFixed(2)} (L2)`],
                ].map(([a, b, e]) => (
                  <tr key={a} className="border-b border-white/5 align-top last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{a}</td>
                    <td className="py-2.5 pr-4 text-foreground/80">{b}</td>
                    <td className="py-2.5 text-foreground/80">{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="builder" number="3" title="Quote builder">
          <Prose>
            <p>
              Run the decision for one market. Enter the word&rsquo;s counts on the company&rsquo;s past calls, the strike and the 07:00 mid. For full
              ladders, live prices and the LLM, use the <Link href="/research/mention-markets/forecaster">Forecaster</Link>.
            </p>
          </Prose>
          <QuoteBuilder />
        </Section>

        <Section id="risks" number="4" title="What could go wrong">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {[
              ["Fills are not free", "Every number here assumes a fill at the 07:00 mid. Informed traders hit resting offers more often than uninformed ones (adverse selection), so live capture will be lower. Paper-trade one reporting season and log every fill first."],
              ["The premium is shrinking", `It fell from ${c(K.maker.before_2026_04.mean)} before April 2026 to ${c(K.maker.from_2026_04.mean)} after, and the fitted γ is drifting toward zero (about ${Math.abs(pde.hedge_reported.premium_trend_c_per_season).toFixed(1)}¢ a season, t ${pde.hedge_reported.premium_trend_t.toFixed(1)}). Re-run the Rellich test each season: if the new curve falls outside the shuffled range, stop.`],
              ["Each loss is large", "Selling YES at P loses 1 − P when the word is said. The edge is a few cents per contract, so it only shows up across many calls. Size so a bad week of calls is survivable."],
              ["Fees and rules vary", "Maker fees differ by series (some are zero; the study charges 1.75% × P × (1 − P) everywhere), and Kalshi's counting rules for a word can differ from market to market. Read each market's rules."],
            ].map(([t, d]) => (
              <div key={t} className="surface rounded-2xl p-5">
                <p className="mb-1 font-medium">{t}</p>
                <p className="text-sm leading-relaxed text-foreground/80">{d}</p>
              </div>
            ))}
          </div>
          <Callout title="Not investment advice">
            This is research on historical data with simplifying assumptions. Past premiums do not guarantee future ones.
          </Callout>
        </Section>
      </div>
    </div>
  );
}
