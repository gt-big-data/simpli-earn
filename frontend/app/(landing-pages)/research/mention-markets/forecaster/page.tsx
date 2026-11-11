import type { Metadata } from "next";
import Forecaster from "@/components/mention-lab/Forecaster";
import { PageHeader } from "@/components/mention-lab/ui";

export const metadata: Metadata = { title: "Forecaster | SimpliEarn" };

export default function ForecasterPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-20">
      <PageHeader eyebrow="Tool" title="Mention Forecaster">
        Forecast how many times management will say a word on the next call and price every &ldquo;said at least k times&rdquo; strike: the
        negative binomial against the Poisson base rate, market prices with Kalshi fees, a walk-forward check and an optional LLM ladder. Examples
        come from SimpliEarn&rsquo;s transcripts; type any counts to use your own.
      </PageHeader>
      <Forecaster />
    </div>
  );
}
