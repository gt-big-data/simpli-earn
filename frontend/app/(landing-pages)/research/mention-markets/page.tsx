import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Stat, Tex } from "@/components/mention-lab/ui";
import { findings, pde } from "@/lib/mention-lab/data";
import { insights } from "@/lib/insights";

export const metadata: Metadata = {
  title: `${insights[0].title} | SimpliEarn`,
};

const c = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(1)}¢`;

export default function Home() {
  const K = findings.kalshi;
  const F = K.maker_model_filtered["model below mid by > 0.04"];
  const steps = [
    {
      n: "1",
      title: "Negative binomial",
      formula: "N \\mid \\lambda \\sim \\text{Pois}(\\lambda),\\ \\lambda\\sim\\Gamma",
      text: "The rate a word is said at is uncertain, so its count is negative binomial, not Poisson. That moves fair prices in both tails.",
      href: "/research/mention-markets/theory#nb",
    },
    {
      n: "2",
      title: "Pricing PDEs",
      formula: "\\partial_\\tau V + \\sup_v \\mathcal{L}^v V = 0",
      text: `An in-call filter, a CARA pricing equation and a robust HJB. Lottery-seeking buyers (γ̂ = ${pde.cara.gamma.toFixed(2)}) push YES above its probability.`,
      href: "/research/mention-markets/theory#pde",
    },
    {
      n: "3",
      title: "Rellich–Kondrachov",
      formula: "H^1(\\Omega)\\hookrightarrow L^2(\\Omega)\\ \\text{compact}",
      text: `Seasonal premium curves are bounded, so precompact. Tested: they are consistent with one limit (p = ${pde.rellich.p.Hm1.toFixed(2)} in H⁻¹).`,
      href: "/research/mention-markets/theory#rellich",
    },
    {
      n: "4",
      title: "The strategy",
      formula: "\\text{sell YES at the mid} \\;\\text{where}\\; \\text{NB} < \\text{mid}",
      text: `Rest YES offers at 07:00 ET on the call date, 5–90¢, where the model is below the mid. ${c(K.maker.all.mean)} per contract after fees.`,
      href: "/research/mention-markets/strategy",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-20">
      <div className="mb-16 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Maker premium, all 5–90¢" value={c(K.maker.all.mean)} note={`per contract after fee · t ${K.maker.all.t.toFixed(1)}`} />
        <Stat label="Where model is > 4¢ below mid" value={c(F.mean)} note={`t ${F.t.toFixed(1)} · ${F.contracts.toLocaleString()} contracts`} />
        <Stat label="Taker trades" value="≈ 0 or less" note="spread + 7% fee eat the bias" />
        <Stat label="LLM alone" value={findings.llm.LLM.brier.toFixed(3)} note={`Brier vs market ${findings.llm["market mid"].brier.toFixed(3)}`} />
      </div>

      <h2 className="mb-6 text-3xl font-light tracking-tight">From theory to a trade</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {steps.map((s) => (
          <Link key={s.n} href={s.href} className="surface group flex flex-col gap-3 rounded-2xl p-5 text-foreground no-underline transition-colors hover:bg-white/5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-lg font-medium">
                <span className="mr-2 text-brand">{s.n}</span>
                {s.title}
              </p>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
            <div className="overflow-x-auto text-foreground/90">
              <Tex>{s.formula}</Tex>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
          </Link>
        ))}
      </div>

      <p className="mt-14 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Data: Kalshi public market data ({K.first_call} to {K.last_call}), earnings transcripts, and the eventdist research package. Every result
        assumes fills at the 07:00 ET mid; live results will be lower. Research, not investment advice.
      </p>
    </div>
  );
}
