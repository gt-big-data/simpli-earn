import type { Metadata } from "next";
import { CalibrationChart, CaraSeasons, LlmTable, MonthlyChart, QuintileChart, TradeTable, TranscriptChart } from "@/components/mention-lab/EvidenceCharts";
import { PageHeader, Stat } from "@/components/mention-lab/ui";
import { findings, pde } from "@/lib/mention-lab/data";

export const metadata: Metadata = { title: "Evidence | SimpliEarn" };

export default function EvidencePage() {
  const K = findings.kalshi;
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-20">
      <PageHeader eyebrow="Evidence" title="What the data says">
        Every Kalshi earnings-mention market from {K.first_call} to {K.last_call}, priced at 07:00 ET on the call date (a market&rsquo;s close time
        is after settlement, so later snapshots can fall inside the call). {K.excluded_uncertain_call_date} markets without a usable call date are
        held out. Source: the eventdist research package; the PDE and Rellich numbers are recomputed from its raw rows.
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Markets" value={K.markets.toLocaleString()} note={`${K.events} calls · ${K.companies} companies`} />
        <Stat label="Settled YES" value={`${(100 * K.yes_rate).toFixed(1)}%`} note={`median spread ${(100 * K.median_spread).toFixed(0)}¢`} />
        <Stat label="Maker premium" value={`+${(100 * K.maker.all.mean).toFixed(2)}¢`} note={`per contract after fee, t ${K.maker.all.t.toFixed(1)}`} />
        <Stat label="Verbosity correlation" value={pde.within_event_rho.toFixed(3)} note="within a call, across words" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <CalibrationChart />
        <QuintileChart />
        <div className="lg:col-span-2">
          <TradeTable />
        </div>
        <MonthlyChart />
        <CaraSeasons />
        <TranscriptChart />
        <LlmTable />
      </div>
    </div>
  );
}
