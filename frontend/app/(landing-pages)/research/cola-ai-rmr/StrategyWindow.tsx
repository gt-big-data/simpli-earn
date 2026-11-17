"use client";

import { Fragment, useState } from "react";
import figures from "@/data/cola-ai-figures.json";

const { dates, adjusted, events } = figures;
const windowSize = 20;
const lastStart = dates.length - windowSize;
const colors = { Cola: "#84c6e9", AI: "#f1ac79" };
const calendar = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => calendar.format(new Date(iso + "T12:00:00Z"));

export default function StrategyWindow() {
  const [start, setStart] = useState(dates.indexOf("2022-04-18"));
  const days = dates.slice(start, start + windowSize);
  const first = days[0], last = days[days.length - 1];
  const tracks = (["Cola", "AI"] as const).map((basket, column) => {
    let level = 100;
    const values = days.map((_, i) => {
      if (i > 0) level *= 1 + adjusted[start + i][column];
      return level;
    });
    return { basket, values };
  });
  const values = tracks.flatMap(series => series.values);
  const interval = Math.max(1, Math.ceil((Math.max(...values) - Math.min(...values)) / 4));
  const low = Math.floor(Math.min(...values) / interval) * interval;
  const high = Math.ceil(Math.max(...values) / interval) * interval;
  const ticks = Array.from({length: (high - low) / interval + 1}, (_, i) => low + i * interval);
  const x = (i: number) => i * 100 / (windowSize - 1);
  const y = (v: number) => 100 * (high - v) / (high - low);
  const inWindow = (day: string) => day >= first && day <= last;
  const visible = events.filter(event => inWindow(event.decision) || inWindow(event.fill));
  return <figure className="surface rounded-2xl p-4 md:p-6" aria-labelledby="strategy-window-title">
    <h3 id="strategy-window-title" className="text-xl font-medium">Where did the strategy switch?</h3>
    <p className="mt-1 text-sm text-muted-foreground">SPY-adjusted basket paths · First visible close = 100 · Next-close execution</p>
    <div className="my-5 flex flex-wrap items-baseline justify-between gap-3">
      <p className="text-lg tabular-nums" aria-live="polite">{shortDate(first)}, {first.slice(0, 4)} – {shortDate(last)}, {last.slice(0, 4)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span style={{color: colors.Cola}}>━ Cola</span><span style={{color: colors.AI}}>┄ AI</span>
        <span>◇ Decision</span><span>● Fill</span>
      </div>
    </div>
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] pr-2 text-xs tabular-nums text-muted-foreground">
      <div className="relative" aria-hidden="true">{ticks.map(tick =>
        <span key={tick} className="absolute right-2 -translate-y-1/2" style={{top: `${y(tick)}%`}}>{tick}</span>)}</div>
      <div className="relative my-0 h-48 md:h-64" role="img" aria-label={`SPY-adjusted Cola and AI paths from ${first} to ${last}. Switch dates appear below.`}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)}
            stroke="currentColor" strokeOpacity={tick === 100 ? .55 : .2} vectorEffect="non-scaling-stroke" />)}
          {tracks.map(({basket, values}) => <polyline key={basket} fill="none" stroke={colors[basket]} strokeWidth="2.4"
            strokeDasharray={basket === "AI" ? "6 3" : undefined} vectorEffect="non-scaling-stroke"
            points={values.map((value, i) => `${x(i)},${y(value)}`).join(" ")} />)}
        </svg>
        {visible.map(event => (["decision", "fill"] as const).map(kind => {
          const i = days.indexOf(event[kind]);
          if (i < 0) return null;
          const track = tracks[event.basket === "AI" ? 1 : 0];
          const top = y(track.values[i]);
          const position = {left: `${x(i)}%`, top: `${top}%`};
          return <Fragment key={event.decision + kind}><span
            title={`${event[kind]} · ${kind === "decision" ? "Target" : "Bought"} ${event.basket} · adjusted index ${track.values[i].toFixed(2)}`}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2"
            style={{...position, borderColor: colors[track.basket],
              rotate: kind === "decision" ? "45deg" : undefined, borderRadius: kind === "fill" ? "50%" : undefined,
              backgroundColor: kind === "fill" ? colors[track.basket] : "#111615"}} />
            {kind === "decision" && <span aria-hidden="true"
              className="pointer-events-none absolute hidden whitespace-nowrap rounded bg-[#121716] px-1 text-xs sm:block"
              style={{...position, color: colors[track.basket], transform: `translate(${i === 0 ? "0" : i === windowSize - 1 ? "-100%" : "-50%"}, ${top < 15 ? "10px" : "-25px"})`}}>
              {shortDate(event.decision)}
            </span>}
          </Fragment>;
        }))}
      </div>
      <div className="relative col-start-2 mt-2 h-5" aria-hidden="true">
        {[0, 6, 12, 19].map(i => <span key={i} className="absolute whitespace-nowrap"
          style={{left: `${x(i)}%`, transform: i === 0 ? undefined : i === windowSize - 1 ? "translateX(-100%)" : "translateX(-50%)"}}>
          {shortDate(days[i])}</span>)}
      </div>
    </div>
    <div className="mt-4 border-y border-white/10 py-3">
      <label className="block text-sm" htmlFor="window-start">Slide the 20-session window</label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn-outline" disabled={start === 0} aria-label="One session earlier" onClick={() => setStart(start - 1)}>←</button>
        <input type="range" id="window-start" className="min-w-0 flex-1 accent-[var(--brand)]" min="0" max={lastStart} step="1"
          value={start} aria-valuetext={`${first} through ${last}`} onChange={e => setStart(Number(e.target.value))} />
        <button type="button" className="btn-outline" disabled={start === lastStart} aria-label="One session later" onClick={() => setStart(start + 1)}>→</button>
      </div>
    </div>
    {visible.length > 0 ? <table className="mt-3 w-full text-left text-sm tabular-nums">
      <caption className="sr-only">Decisions or fills within the visible window</caption>
      <thead className="text-muted-foreground"><tr><th scope="col">New target</th><th scope="col">Decision close ◇</th><th scope="col">Purchase close ●</th></tr></thead>
      <tbody>{visible.map(event => <tr key={event.decision} className="border-t border-white/10">
        <th scope="row" className="py-1.5 text-left font-normal">{event.basket}</th>
        <td>{event.decision}</td><td>{event.fill}</td></tr>)}</tbody>
    </table> : <p className="mt-3 text-sm text-muted-foreground">The account held its basket throughout this window.</p>}
    <figcaption className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
      Each line compounds the daily SPY-adjusted returns from the first visible close. A diamond marks the close when the confirmed target changed.
      A dot marks the purchase of that basket. The table pairs the dates even when one falls outside the window.
      The strategy used the unadjusted USD total-return indices to make decisions and value trades.
    </figcaption>
  </figure>;
}
