import study from "@/data/cola-ai-rmr.json";

const days = study.examplePrices;
const baskets = [
  { key: "cola", name: "Cola", color: "#79bafb", dash: undefined },
  { key: "ai", name: "AI", color: "#e18954", dash: "5 3" },
] as const;
const ticks = [105, 100, 95, 90];
const y = (value: number) => (105 - value) * 100 / 15;
const x = (i: number) => 100 * i / (days.length - 1);

export default function ExampleChart() {
  return (
    <figure className="surface max-w-3xl rounded-2xl p-4 md:p-6" aria-labelledby="example-price-heading">
      <h3 id="example-price-heading" className="text-xl font-medium">Where the first two switches traded</h3>
      <p className="mt-1 text-sm text-muted-foreground">Basket closing values in U.S. dollars, indexed to 100 on April 25, 2022</p>
      <ul className="my-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {baskets.map(b => <li key={b.key} className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke={b.color} strokeWidth="2" strokeDasharray={b.dash} /></svg>
          {b.name}</li>)}
        <li><span aria-hidden="true" className="text-[#79dc99]">▲</span> Buy</li>
        <li><span aria-hidden="true" className="text-[#fb9089]">▼</span> Sell</li>
      </ul>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] pr-2 text-xs tabular-nums text-muted-foreground">
        <div aria-hidden="true" className="relative">{ticks.map(tick =>
          <span key={tick} className="absolute right-1.5 -translate-y-1/2" style={{ top: `${y(tick)}%` }}>{tick}</span>)}</div>
        <div className="relative h-40 md:h-48" role="img" aria-label="Closing basket index values. On May 3 the account bought Cola at 97.17 and sold AI at 99.72. On May 10 it sold Cola at 94.58 and bought AI at 92.33.">
          <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)}
              stroke="currentColor" strokeOpacity=".24" vectorEffect="non-scaling-stroke" />)}
            {days.map((day, i) => day.bought && <line key={day.date} x1={x(i)} x2={x(i)} y1="0" y2="100" stroke="currentColor"
              strokeOpacity=".55" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
            {baskets.map(b => <polyline key={b.key} fill="none" stroke={b.color} strokeWidth="2" strokeDasharray={b.dash} vectorEffect="non-scaling-stroke"
              points={days.map((day, i) => `${x(i)},${y(day[b.key])}`).join(" ")} />)}
          </svg>
          {days.map((day, i) => day.bought && baskets.map(b => {
            const buy = day.bought === b.name;
            return <span key={day.date + b.key} aria-hidden="true"
              title={`${day.date} · ${buy ? "Buy" : "Sell"} ${b.name} · ${day[b.key].toFixed(2)}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-base leading-none"
              style={{ left: `${x(i)}%`, top: `${y(day[b.key])}%`, color: buy ? "#79dc99" : "#fb9089", textShadow: "0 0 2px #111" }}>
              {buy ? "▲" : "▼"}
            </span>;
          }))}
        </div>
        <div aria-hidden="true" className="relative col-start-2 mt-2 h-5">
          <span>Apr 25</span>
          {days.map((day, i) => day.bought && <span key={day.date} style={{ left: `${x(i)}%` }} className="absolute -translate-x-1/2 whitespace-nowrap">
            May {Number(day.date.slice(-2))}
          </span>)}
        </div>
      </div>
      <figcaption className="mt-2 text-sm leading-relaxed text-muted-foreground">
        At the next-close fills, the account bought Cola on May 3 and sold it on May 10.
        Cola fell about 2.7% between those closing marks.
      </figcaption>
    </figure>
  );
}
