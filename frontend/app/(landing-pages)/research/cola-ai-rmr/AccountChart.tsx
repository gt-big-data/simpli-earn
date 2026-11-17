import study from "@/data/cola-ai-rmr.json";
import styles from "./AccountChart.module.css";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const series = [
  { key: "both", label: "Hold both", color: "#afb4bb", dash: "7 4" },
  { key: "ai", label: "Hold AI", color: "#e18954", dash: "2 3" },
  { key: "rmr", label: "Three-confirmation RMR", color: "#6fd98a", dash: undefined },
] as const;

const yearTicks = study.dates.flatMap((date, index) =>
  index > 0 && study.dates[index - 1].slice(0, 4) !== date.slice(0, 4)
    ? [{ year: date.slice(0, 4), percent: 100 * index / (study.dates.length - 1) }]
    : [],
);

type Measure = "value" | "decline" | "relative";
const measures = {
  value: { label: "Account value (USD)", ticks: [1000000, 750000, 500000, 250000, 0] },
  decline: { label: "Decline from previous peak (%)", ticks: [0, -15, -30, -45, -60] },
  relative: { label: "Account value relative to holding AI (%)", ticks: [40, 20, 0, -20, -40, -60] },
};

function chartPath(prices: number[], ai: number[], measure: Measure, bottom: number, top: number) {
  let peak = prices[0];
  return prices.map((price, i) => {
    peak = Math.max(peak, price);
    let value = price;
    if (measure === "decline") value = 100 * (price / peak - 1);
    if (measure === "relative") value = 100 * (price / ai[i] - 1);
    const x = (1000 * i / (prices.length - 1)).toFixed(1);
    const y = (240 * (top - value) / (top - bottom)).toFixed(2);
    return `${i ? "L" : "M"}${x},${y}`;
  }).join("");
}

function ChartPanel({ delay, measure, className }: { delay: number; measure: Measure; className: string }) {
  const { equity, summary, belowAI } = study.schedules[delay - 1];
  const { label, ticks } = measures[measure];
  const finalGap = 100 * (summary.rmr.ending / summary.ai.ending - 1);
  const top = ticks[0];
  const bottom = ticks[ticks.length - 1];
  return (
    <div className={`${styles.panel} ${className}`} data-chart-panel>
      <p className="mb-3 text-sm text-muted-foreground">{label}</p>
      <div className={styles.plot}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((value, i) => (
            <span key={value} style={{ top: `${100 * i / (ticks.length - 1)}%` }}>
              {measure !== "value" ? `${value}%` : value === 1000000 ? "$1m" : value === 0 ? "$0" : `$${value / 1000}k`}
            </span>
          ))}
        </div>
        <svg className={styles.lines} viewBox="0 0 1000 240" preserveAspectRatio="none" role="img"
          aria-label={`${label} of three-confirmation RMR, holding both baskets, and holding AI from 2022 through 2026, at execution delay ${delay}.`}>
          {ticks.map((tick, i) => (
            <line key={tick} x1="0" x2="1000" y1={240 * i / (ticks.length - 1)} y2={240 * i / (ticks.length - 1)}
              stroke="currentColor" strokeOpacity={measure === "relative" && tick === 0 ? 0.5 : 0.14} vectorEffect="non-scaling-stroke" />
          ))}
          {series.map(({ key, color, dash }) => (
            <path key={key} d={chartPath(equity[key], equity.ai, measure, bottom, top)} fill="none" stroke={color}
              strokeWidth={key === "rmr" ? 2.25 : 1.7} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className={styles.xAxis} aria-hidden="true">
          {yearTicks.map(({ year, percent }) => <span key={year} style={{ left: `${percent}%` }}>{year}</span>)}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-chart-summary>
        {measure === "relative" ? (
          <>Zero is the AI-only account. RMR closed below AI on {belowAI.toLocaleString("en-US")} of {(equity.ai.length - 1).toLocaleString("en-US")} sessions.
            It finished {Math.abs(finalGap).toFixed(1)}% {finalGap < 0 ? "behind" : "ahead of"} AI.</>
        ) : measure === "decline" ? (
          <>Largest peak-to-trough declines at this delay were {Math.abs(summary.rmr.drawdown).toFixed(1)}% for RMR,
            {" "}{Math.abs(summary.both.drawdown).toFixed(1)}% for holding both, and {Math.abs(summary.ai.drawdown).toFixed(1)}% for holding AI.</>
        ) : (
          <>After modeled costs, RMR ended at {dollars.format(summary.rmr.ending)}.
            Holding both ended at {dollars.format(summary.both.ending)} and holding AI at {dollars.format(summary.ai.ending)}.</>
        )}
      </p>
    </div>
  );
}

export default function AccountChart() {
  return (
    <figure className={`surface min-w-0 rounded-2xl p-4 md:p-6 ${styles.chart}`} aria-labelledby="account-heading">
      <h3 id="account-heading" className="text-xl font-medium">What happened to $100,000?</h3>
      <div className="my-4 flex flex-wrap gap-x-8 gap-y-3">
        <fieldset className={styles.choices}>
          <legend>Simulated execution</legend>
          <label><input type="radio" name="rmr-delay" value="one" defaultChecked />Next close</label>
          <label><input type="radio" name="rmr-delay" value="two" />One close later</label>
        </fieldset>
        <fieldset className={styles.choices}>
          <legend>Chart measure</legend>
          <label><input type="radio" name="rmr-measure" value="value" defaultChecked />Account value</label>
          <label><input type="radio" name="rmr-measure" value="decline" />Decline from peak</label>
          <label><input type="radio" name="rmr-measure" value="relative" />Gap to holding AI</label>
        </fieldset>
      </div>
      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map(({ key, label, color, dash }) => (
          <li key={key} className="inline-flex items-center gap-1.5">
            <svg aria-hidden="true" width="24" height="8"><line x1="0" x2="24" y1="4" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} /></svg>
            {label}
          </li>
        ))}
      </ul>
      <ChartPanel delay={1} measure="value" className={styles.firstValue} />
      <ChartPanel delay={1} measure="decline" className={styles.firstDecline} />
      <ChartPanel delay={1} measure="relative" className={styles.firstRelative} />
      <ChartPanel delay={2} measure="value" className={styles.secondValue} />
      <ChartPanel delay={2} measure="decline" className={styles.secondDecline} />
      <ChartPanel delay={2} measure="relative" className={styles.secondRelative} />
    </figure>
  );
}
