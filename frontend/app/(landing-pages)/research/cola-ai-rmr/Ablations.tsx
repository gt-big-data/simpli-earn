import study from "@/data/cola-ai-rmr.json";
import figures from "@/data/cola-ai-figures.json";
import { Prose } from "@/components/mention-lab/ui";
import AccountChart from "./AccountChart";
import ExampleChart from "./ExampleChart";
import ArticleTable from "./ArticleTable";

const usd = (value: number) => "$" + value.toLocaleString("en-US");
const comparisons = [
  ["rmr", "Three confirmations"], ["two", "Two confirmations"], ["ai", "Hold AI"],
  ["cola", "Hold Cola"], ["both", "Hold both, initially 50/50"], ["nvda", "Hold NVIDIA"], ["spy", "Hold SPY"],
] as const;
const variations = [
  ["Published RMR", "Two confirmations", "Switch after two consecutive opposite signals."],
  ["Three confirmations", "Three confirmations", "Wait one more signal in both directions."],
  ["Half AI core", "Half AI core", "Hold half the starting capital in AI and run the two-signal rule on the rest."],
  ["Quarterly trend filter", "Quarterly trend filter", "Allow a move to Cola only when AI trails Cola over the last 63 sessions."],
  ["Cover round-trip costs", "Minimum rebound", "Require two forecasts that cover the estimated round-trip cost to enter Cola."],
  ["Weekly review", "Weekly review", "Read the two-signal target on the last scheduled New York session each week."],
  ["Half two / half three, pooled orders", "Split the account", "Fund the two- and three-signal rules equally and pool their stock orders."],
] as const;
const disclosure = "surface rounded-2xl p-4 md:p-5";

export default function Ablations() {
  const [first, later] = study.schedules;
  return <>
    <Prose><p>Each simulation started with $100,000. At the next eligible close, three confirmations finished 26.1% ahead of holding AI.
      Moving every order one New York session later left the strategy 7.5% behind AI. Its largest drawdown was about 30% on either schedule, compared with 45% for AI.</p></Prose>
    <details className={disclosure} id="evidence">
      <summary className="cursor-pointer font-medium">Execution delay and passive benchmarks</summary>
      <div className="mt-4 space-y-5">
        <Prose><p>The March 31, 2022 instruction initially left the account in cash until April 1 at the next close or April 4 on the delayed schedule.
          Each benchmark bought on its corresponding schedule and then held through November 6, 2026.</p></Prose>
        <ArticleTable caption="Net profit after modeled costs, above the initial $100,000"
          columns={["Account", "Next eligible close", "One session later"]}
          rows={comparisons.map(([key, label]) => ({label, cells: [first, later].map(s => usd(s.summary[key].ending - 100000))}))} />
        <AccountChart />
        <ExampleChart />
      </div>
    </details>
    <details className={disclosure} id="variations">
      <summary className="cursor-pointer font-medium">Confirmation length and alternative rules</summary>
      <div className="mt-4 space-y-4">
        <ArticleTable caption="How often the target changed after the initial allocation"
          columns={["Consecutive closes required", "Target switches"]}
          rows={figures.confirmations.map(({closes, switches}) => ({
            label: closes === 1 ? "1 · Follow each model preference" : String(closes), cells: [switches],
          }))} />
        <ArticleTable caption="Ending wealth including initial capital, under the same execution-cost model"
          columns={["Rule", "What changed", "Next close", "One later"]}
          rows={variations.map(([key, label, detail]) => ({label, cells: [detail, ...study.variants[key].map(usd)]}))} />
        <Prose><p>Changing two confirmations to three reduced dates with trades from 181 to 137 on both schedules.
          It added $147,086 to the next-close account and cost $80,120 at the later close. Weekly review missed profitable switches at both delays.
          The split rule was devised after observing the individual results. It still ended $299 behind AI on the later schedule.</p>
        </Prose>
      </div>
    </details>
    <details className={disclosure} id="costs">
      <summary className="cursor-pointer font-medium">Spreads, commissions and break-even costs</summary>
      <div className="mt-4"><Prose>
        <p>The model charged $0.25 per stock purchased, or $4.25 for a Cola purchase and $2.75 for AI. Both sides of a trade paid the estimated half-spread.
          Fresh U.S. quotes from the final minute and basket weights determined that rate where available. A 25-basis-point fallback charged $25 per $10,000 traded for foreign or missing observations.</p>
        <p>The next-close account paid approximately $71,961 in spreads and $479 in commissions. With a uniform one-way spread, the break-even cost against holding AI was {first.aiBreakEvenBp} basis points
          at the next close and {later.aiBreakEvenBp} one session later. Against the 50/50 account those limits were {first.breakEvenBp} and {later.breakEvenBp} basis points.
          At 25 basis points the strategy ended at {usd(first.at25bp)} and {usd(later.at25bp)}.</p>
        <p>Fractional shares and order sizes based on final closing marks simplify execution. Closing-auction deadlines, market depth, dividend payment dates and taxes can change realized results.</p>
      </Prose></div>
    </details>
    <details className={disclosure} id="timing">
      <summary className="cursor-pointer font-medium">How often did shuffled timing do as well?</summary>
      <div className="mt-4"><Prose>
        <p>Shifting each year’s instructions around its calendar retained much of the sequence of holding periods. We scored each shifted schedule by its weaker result across the two execution delays,
          relative to holding both baskets. The observed three-signal rule finished {study.placebo.weakerAdvantage}% above that benchmark at its weaker delay.
          Of {study.placebo.draws.toLocaleString("en-US")} shifted calendars, {study.placebo.unitMatches} matched or exceeded its score.
          Allowing each calendar to pick the best of {study.placebo.familySize} related rules raised that count to {study.placebo.familyMatches}.</p>
        <p>Against holding AI, resampling paired 63-session blocks gave a 95% range of −22.9 to +34.7 percentage points for the next-close annual log-return advantage.
          At the later close the range was −30.5 to +27.4 points. Both ranges include a loss relative to AI.</p>
      </Prose></div>
    </details>
  </>;
}
