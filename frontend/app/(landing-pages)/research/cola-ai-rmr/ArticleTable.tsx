import type { ReactNode } from "react";

export default function ArticleTable({ caption, columns, rows }: {
  caption: string; columns: string[]; rows: { label: string; cells: ReactNode[] }[];
}) {
  return <div className="surface overflow-x-auto rounded-2xl px-4 py-2 md:px-6">
    <table className="w-full text-left text-sm leading-relaxed tabular-nums">
      <caption className="pt-3 pb-2 text-left font-medium">{caption}</caption>
      <thead className="text-muted-foreground"><tr>{columns.map(col =>
        <th scope="col" key={col} className="border-b border-white/15 py-2 pr-4 align-bottom font-normal last:pr-0">{col}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className="border-b border-white/10 align-top last:border-0">
        <th scope="row" className="py-2.5 pr-4 font-medium">{row.label}</th>
        {row.cells.map((cell, i) => <td className="py-2.5 pr-4 last:pr-0" key={columns[i + 1]}>{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
