import figures from "@/data/cola-ai-figures.json";

export default function MedianFigure() {
  const days = figures.window;
  const latest = days[days.length - 1];
  const points = days.map(day => ({ ...day, x: 100 * (day.cola / latest.cola - 1), y: 100 * (day.ai / latest.ai - 1) }));
  const median = points.find(day => day.date === figures.medianDate)!;
  // Use the same number of pixels per percentage point on both axes.
  const x = (value: number) => 100 + 50 * value;
  const y = (value: number) => 100 - 50 * value;
  const labels = [[-12, 0], [12, 7], [9, -6], [13, -2], [-9, -9]];
  const label = (iso: string) => (iso === latest.date ? "May 2" : "Apr " + Number(iso.slice(-2)));
  return <figure className="surface rounded-2xl p-5 md:p-6">
    <h4 className="text-xl font-medium">Five closes leading into May 2, 2022</h4>
    <div className="mt-4 grid items-center gap-5 md:grid-cols-2">
      <div>
        <table className="w-full text-right text-sm tabular-nums">
          <caption className="pb-3 text-left text-muted-foreground">USD total-return index · March 31 = 100</caption>
          <thead><tr className="border-b border-white/15"><th className="py-2 text-left">Close</th><th>Cola</th><th>AI</th></tr></thead>
          <tbody>{points.map(point => <tr key={point.date} className="border-b border-white/10">
            <th scope="row" className="py-2 text-left font-normal">{label(point.date)}</th>
            <td>{point.cola.toFixed(3)}</td><td>{point.ai.toFixed(3)}</td>
          </tr>)}</tbody>
        </table>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Divide each column by its May 2 close and subtract one to plot it as a percentage.
          On April 29, Cola was {median.x.toFixed(2)}% above its May 2 level and AI was {Math.abs(median.y).toFixed(2)}% below.</p>
      </div>
      <svg viewBox="0 0 350 349" className="mx-auto w-full max-w-[370px]" role="img" aria-labelledby="median-scatter-title">
        <title id="median-scatter-title">Five paired closes relative to May 2. The geometric median coincides with April 29 at plus 0.66% Cola and minus 2.58% AI.</title>
        <text x="50" y="15" fill="#bec8c4" fontSize="12">AI relative to May 2 (%)</text>
        {[-1, 0, 1, 2, 3, 4].map(t => <g key={t}>
          <line x1={x(t)} x2={x(t)} y1="23" y2="308" stroke="currentColor" strokeOpacity={t === 0 ? .42 : .1} />
          <text x={x(t)} y="325" textAnchor="middle" fill="#aab3af" fontSize="12">{t}</text></g>)}
        {[-4,-3,-2,-1,0,1].map(t => <g key={t}>
          <line x1="50" x2="306" y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? .42 : .1} />
          <text x="40" y={y(t) + 4} textAnchor="end" fill="#aab3af" fontSize="12">{t}</text></g>)}
        <text x="178" y="346" textAnchor="middle" fontSize="12" fill="#bec8c4">Cola relative to May 2 (%)</text>
        {points.map((p, i) => <g key={p.date}>
          <line x1={x(p.x)} y1={y(p.y)} x2={x(median.x)} y2={y(median.y)} stroke="#6fd98a" strokeDasharray="3 4" opacity=".65" />
          <circle cx={x(p.x)} cy={y(p.y)} r="4.3" fill="#e1eae6" />
          <text x={x(p.x) + labels[i][0]} y={y(p.y) + labels[i][1]} textAnchor={labels[i][0] < 0 ? "end" : "start"}
            fontSize="12" fill="#e1eae6">{label(p.date)}</text>
        </g>)}
        <circle cx={x(median.x)} cy={y(median.y)} r="9" fill="none" stroke="#6fd98a" strokeWidth="2.5" />
      </svg>
    </div>
    <figcaption className="mt-4 border-t border-white/10 pt-3 text-sm leading-relaxed text-muted-foreground">
      The green ring marks the geometric median. Its four dashed distances to the other closes have the smallest possible total.
      Here the center lands on an observed day. In other windows it can fall between observations.
    </figcaption>
  </figure>;
}
