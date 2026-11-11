import katex from "katex";

/** LaTeX, rendered to HTML at render time (works in server and client components). */
export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = katex.renderToString(children, { displayMode: block, throwOnError: false, output: "html" });
  return block ? (
    <div className="my-4 overflow-x-auto overflow-y-hidden py-1" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-10 max-w-3xl">
      <p className="mb-2 text-sm text-brand">{eyebrow}</p>
      <h1 className="mb-4 text-4xl font-light tracking-tight md:text-5xl">{title}</h1>
      {children && <div className="text-base leading-relaxed text-muted-foreground">{children}</div>}
    </header>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface min-w-0 rounded-2xl p-5 ${className}`}>
      {title && <h3 className="mb-4 text-lg font-medium">{title}</h3>}
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="surface min-w-0 rounded-2xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-light tracking-tight">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

/** A numbered section of a long page, with an anchor for the table of contents. */
export function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <p className="mb-1 text-sm text-brand">{number}</p>
      <h2 className="mb-5 text-3xl font-light tracking-tight">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** Body prose with comfortable measure. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="flex max-w-3xl flex-col gap-3 text-[0.95rem] leading-relaxed text-foreground/85">{children}</div>;
}

export function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-brand/25 bg-brand/5 p-4">
      <p className="mb-1 text-sm font-medium text-brand">{title}</p>
      <div className="text-sm leading-relaxed text-foreground/85">{children}</div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-foreground/75">{label}</span>
        <span className="font-medium tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--brand)]"
      />
    </label>
  );
}
