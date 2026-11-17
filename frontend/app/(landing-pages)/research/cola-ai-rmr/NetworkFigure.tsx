"use client";

import { useState } from "react";
import { aiNetwork, colaNetwork } from "./networks";

export default function NetworkFigure({ basket }: { basket: "Cola" | "AI" }) {
  const network = basket === "Cola" ? colaNetwork : aiNetwork;
  const [selected, setSelected] = useState(network.root);
  const symbols = new Map(network.nodes.map(node => [node[0], node]));
  const company = symbols.get(selected)!;
  const neighbors = network.edges.filter(([from, , to]) => from === selected || to === selected);
  const accent = basket === "Cola" ? "#84c6e9" : "#f1ac79";
  const items = network.nodes.filter(node => !node[4]);
  return <figure className="surface overflow-hidden rounded-2xl">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
      <h4 className="text-lg font-medium">{basket === "Cola" ? "Coca-Cola" : "NVIDIA"} company graph</h4>
      <span className="text-sm text-muted-foreground">{items.length} basket holdings · Dashed nodes connect holdings</span>
    </figcaption>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 overflow-x-auto" tabIndex={0} aria-label={`Scrollable ${basket} company graph`}
        style={{ backgroundImage: "radial-gradient(#ffffff12 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
        <div className="relative mx-auto aspect-[780/344] min-w-[610px]">
          <svg viewBox="0 0 780 344" aria-hidden="true" className="absolute inset-0 h-full w-full">
            {[...network.edges].sort((a, b) => Number(neighbors.includes(a)) - Number(neighbors.includes(b))).map(([from, verb, to]) => {
              const source = symbols.get(from)!;
              const target = symbols.get(to)!;
              const active = from === selected || to === selected;
              return <line key={from + verb + to} x1={source[2]} y1={source[3]} x2={target[2]} y2={target[3]}
                stroke={active ? accent : "#78848c"} opacity={active ? 0.8 : 0.38} strokeWidth={active ? 1.8 : 1.3} />;
            })}
          </svg>
          {network.nodes.map(([id, name, x, y, bridge]) => <button type="button" key={id}
            title={name} aria-label={`${id}, ${name}`} aria-pressed={id === selected}
            onClick={() => setSelected(id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer whitespace-nowrap rounded-md border bg-[#111919] px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ left: `${x / 780 * 100}%`, top: `${y / 344 * 100}%`, borderStyle: bridge ? "dashed" : "solid",
              backgroundColor: id === selected ? accent : undefined, color: id === selected ? "#101714" : bridge ? "#adb6b6" : "#e2e9e7",
              borderColor: id === selected || id === network.root ? accent : "#566160" }}>
            {id}
          </button>)}
        </div>
      </div>
      <div className="border-t border-white/10 p-4 lg:border-t-0 lg:border-l">
        <label className="text-sm text-muted-foreground">Inspect a company
          <select className="field-select mt-1 block w-full text-foreground" value={selected} onChange={e => setSelected(e.target.value)}>
            {network.nodes.map(([id, name]) => <option value={id} key={id}>{id} · {name}</option>)}
          </select>
        </label>
        <div aria-live="polite" className="mt-4">
          <p className="text-base font-medium">{company[1]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{company[4] ? "Connecting entity outside the basket" : "Basket holding"} · {selected}</p>
          <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm leading-snug text-foreground/80" tabIndex={0} aria-label="Documented connections">
            {neighbors.map(([from, verb, to]) => <li key={from + verb + to}><strong>{from}</strong> {verb} <strong>{to}</strong>.</li>)}
          </ul>
        </div>
      </div>
    </div>
    <details className="border-t border-white/10 px-5 py-3 text-sm">
      <summary className="cursor-pointer">All {items.length} holdings by company name</summary>
      <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([id, name]) => <li key={id}><strong>{id}</strong> · {name}</li>)}
      </ul>
    </details>
  </figure>;
}
