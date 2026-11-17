import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import InsightByline from "@/components/InsightByline";
import { Callout, Prose, Tex } from "@/components/mention-lab/ui";
import study from "@/data/cola-ai-rmr.json";
import figures from "@/data/cola-ai-figures.json";
import { colaAiRmrInsight as post, formatInsightDate } from "@/lib/insights";
import Ablations from "./Ablations";
import ArticleTable from "./ArticleTable";
import MedianFigure from "./MedianFigure";
import NetworkFigure from "./NetworkFigure";
import StrategyWindow from "./StrategyWindow";

export const metadata: Metadata = { title: post.title + " | SimpliEarn", description: post.description };
const link = "text-brand underline decoration-current/40 underline-offset-4";
const signed = (n: number, places = 2) => (n < 0 ? "−" : "+") + Math.abs(n).toFixed(places);
const sections = [
  ["background", "Background"], ["correlation", "Correlation"], ["portfolio", "Portfolio selection"],
  ["rmr", "RMR"], ["decision", "Decision"], ["ablations", "Ablations"], ["strategy", "Strategy"],
];
const actions = [
  ["1 of 3", "Keep AI. One Cola reading starts a count."],
  ["0 of 3", "Keep AI. The Cola count resets."],
  ["0 of 3", "Keep AI."],
  ["1 of 3", "Keep AI. A new Cola sequence starts."],
  ["2 of 3", "Keep AI. A two-signal rule would switch targets here."],
  ["3 of 3", "Set the target to Cola. The order can trade at a later close."],
];
const strategy = [
  ["Set up the baskets", "Give the 17 Cola stocks equal dollars within Cola and the 11 AI stocks equal dollars within AI at the starting mark. Carry their changing weights forward."],
  ["Observe the close", "Update both USD total-return indices. For market context, remove each basket’s estimated SPY contribution using its prior 63-session beta."],
  ["Estimate the rebound", "Take the latest five paired basket closes, normalize each basket to its current level and find the geometric median. Read its two coordinates as forecast multipliers."],
  ["Update the model weights", "Apply the RMR step to yesterday’s model weights and project onto long-only weights summing to one. Record which basket the model favors."],
  ["Confirm the target", "Accept the first signal from cash. Thereafter hold the last confirmed target until three consecutive closes favor the other basket. An interrupted run starts over."],
  ["Execute and repeat", "At the next eligible close, sell the old basket and buy the new one after spreads and purchase commissions. If an underlying market is closed, carry the pending target forward and use the newest due instruction. Mark the account and repeat at the next close."],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="min-w-0 scroll-mt-28 space-y-5 border-t border-white/10 pt-8 md:pt-10">
    <h2 className="max-w-4xl text-3xl font-light tracking-tight md:text-4xl">{title}</h2>{children}
  </section>;
}

function Formula({ children }: { children: string }) {
  return <div className="max-w-4xl rounded-r-xl border-l-2 border-brand/55 bg-brand/[0.045] px-3 py-0.5 md:px-5">
    <Tex block>{children}</Tex>
  </div>;
}

export default function ColaAiRmrArticle() {
  const corr = figures.correlations;
  const count = figures.dates.length - 1;
  const opposite = figures.adjusted.slice(1).filter(([cola, ai]) => cola * ai < 0).length;
  return <article className="mx-auto max-w-6xl px-5 pt-32 pb-20">
    <header className="mb-7">
      <Link href="/research" className="mb-4 inline-block text-sm text-brand">Research</Link>
      <h1 className="mb-4 max-w-4xl text-4xl leading-[1.05] font-light tracking-tight md:text-6xl">{post.title}</h1>
      <InsightByline authors={post.authors} date={post.date} />
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        If chipmakers sell off, do Coca-Cola bottlers give investors somewhere to go?
        We followed 28 listed companies from concentrate plants to chip foundries, measured how the two baskets moved,
        and tested when a $100,000 account would actually switch.</p>
    </header>
    <nav aria-label="Article sections" className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {sections.map(([id, label]) => <a className="text-brand hover:underline" href={"#" + id} key={id}>{label}</a>)}
    </nav>
    <div className="space-y-12 md:space-y-16">
      <Section id="background" title="Why pair Coca-Cola with NVIDIA?">
        <Prose><p>A grocery store can reorder soft drinks through a slowdown. A data-center operator can postpone an accelerator purchase when its capital budget tightens.
          These different spending cycles motivated a test. After accounting for the broad market, would a basket tied to everyday beverage demand tend to move opposite a basket tied to AI investment?
          And if that happened today, what could an investor decide for tomorrow?</p>
          <p>We built the baskets from documented commercial relationships. Following a brand owner to its bottler, or a chip designer to its foundry, brings in companies across several sectors.
            A negative correlation is a hypothesis to measure. The sector labels alone cannot establish its sign.</p></Prose>
        <h3 id="graph" className="scroll-mt-28 pt-2 text-2xl font-medium">The KO basket</h3>
        <Prose><p>The Coca-Cola Company (KO) owns brands and sells concentrates and syrups. Coca-Cola Consolidated (COKE) is a separately listed bottler that sells finished drinks to Walmart and Kroger.
          Further upstream, ADM owns half of ALMEX, a sweetener supplier to Coca-Cola FEMSA. Select a ticker to trace its documented connections.{" "}
          <a className={link} href="https://www.coca-colacompany.com/about-us/coca-cola-system">The Coca-Cola system</a>{" · "}
          <a className={link} href="https://www.sec.gov/Archives/edgar/data/317540/000162828026009057/coke-20251231.htm">Bottler annual report</a></p></Prose>
        <NetworkFigure basket="Cola" />
        <h3 className="pt-2 text-2xl font-medium">The NVDA basket</h3>
        <Prose><p>NVIDIA designs accelerators. TSMC manufactures chips for NVIDIA and its rival AMD. Following TSMC’s equipment purchases reaches ASML, Applied Materials, Lam Research and KLA.
          Memory, networking and cooling extend the basket to businesses that earn money at different stages of a data-center build.{" "}
          <a className={link} href="https://blogs.nvidia.com/blog/nvidia-manufacture-american-made-ai-supercomputers-us/">NVIDIA on manufacturing</a>{" · "}
          <a className={link} href="https://pr.tsmc.com/english/news/3192">TSMC supplier awards</a></p></Prose>
        <NetworkFigure basket="AI" />
        <Prose><p>On March 31, 2022 each constituent received equal dollars within its basket. Its weight then drifted with its performance.
          The indices reflect splits, foreign-exchange conversion to USD and eligible dividends reinvested on ex-dividend dates.
          We revised the rosters using business relationships and price histories available in 2026. Applying that selection to 2022 makes the test retrospective.</p></Prose>
      </Section>

      <Section id="correlation" title="Do the baskets move in opposite directions?">
        <Prose><p><strong>Start with daily changes.</strong> For basket <Tex>{"i"}</Tex>, let <Tex>{"P_{i,t}"}</Tex> be its USD total-return index at close <Tex>{"t"}</Tex>.
          Its simple return is <Tex>{"r_{i,t}=P_{i,t}/P_{i,t-1}-1"}</Tex>. Compute SPY’s return the same way. Compare the two baskets on matching New York sessions.</p>
          <p><strong>Remove the market contribution.</strong> Estimate each basket’s sensitivity to SPY from the 63 returns ending yesterday.
            Multiply that beta by today’s SPY return and subtract it from today’s basket return. The study removes this market term only.</p></Prose>
        <Formula>{"\\beta_{i,t-1}=\\frac{\\operatorname{Cov}_{t-63:t-1}(r_i,r_{SPY})}{\\operatorname{Var}_{t-63:t-1}(r_{SPY})},\\qquad u_{i,t}=r_{i,t}-\\beta_{i,t-1}r_{SPY,t}"}</Formula>
        <Prose><p>For example, a beta of 1.3 and a +1% SPY day imply a +1.3% market contribution. If the basket gained 1.0%, its adjusted return was −0.3%. An investor holding the basket earned the full +1.0%.</p>
          <p><strong>Measure the relationship.</strong> Pearson correlation compares the deviations of each series from its own sample mean.
            A positive product adds to the numerator when both moves are above their means or both are below. Opposite deviations subtract.
            Dividing by their combined scale gives a coefficient between −1 and +1.</p></Prose>
        <Formula>{"\\rho(x,y)=\\frac{\\sum_{t=1}^{n}(x_t-\\bar x)(y_t-\\bar y)}{\\sqrt{\\sum_{t=1}^{n}(x_t-\\bar x)^2}\\sqrt{\\sum_{t=1}^{n}(y_t-\\bar y)^2}}"}</Formula>
        <ArticleTable caption="April 1, 2022 through November 6, 2026" columns={["Paired returns", "Observations", "Pearson correlation"]}
          rows={[
            {label: "Cola and AI on the same day, raw", cells: [count.toLocaleString("en-US"), signed(corr.raw, 3)]},
            {label: "Cola and AI on the same day, SPY-adjusted", cells: [count.toLocaleString("en-US"), signed(corr.adjusted, 3)]},
            {label: "Adjusted Cola today, adjusted AI next session", cells: [(count - 1).toLocaleString("en-US"), signed(corr.colaLeads, 3)]},
            {label: "Adjusted AI today, adjusted Cola next session", cells: [(count - 1).toLocaleString("en-US"), signed(corr.aiLeads, 3)]},
          ]} />
        <Callout title="Does this give a market edge?">The adjusted returns had opposite signs on {opposite} of {count.toLocaleString("en-US")} sessions ({(100 * opposite / count).toFixed(1)}%).
          Their same-day correlation describes a moderate tendency to move apart once the market contribution is removed. Both moves are already known at the close.
          Shifting either basket forward one session brought the correlation close to zero. This sample gives little support for trading tomorrow’s basket from today’s move in the other one.</Callout>
      </Section>

      <Section id="portfolio" title="Portfolio selection turns the observation into a decision">
        <Prose><p>A portfolio rule must say how many dollars to put in each basket using information available when the choice is made.
          Let <Tex>{"b_t=(b_C,b_A)"}</Tex> denote the model’s Cola and AI weights. With long-only weights that sum to one, a 75/25 allocation would give $75,000 to Cola and $25,000 to AI in a $100,000 account.
          Once invested, its one-session gross return multiplier before costs is <Tex>{"b_C(1+r_C)+b_A(1+r_A)"}</Tex>.</p>
          <p>The correlation result suggests the baskets can offset some market-adjusted moves. Choosing between them requires a forecast.
            We tested whether the basket furthest below its recent price center would rebound. The forecast uses the two USD total-return indices because those are the assets the account can own.</p></Prose>
      </Section>

      <Section id="rmr" title="How Robust Median Reversion sets the weights">
        <Prose><p>Robust Median Reversion (RMR) uses several past price vectors to estimate a central price for the next session. Our implementation treats each basket as one asset.
          It produces model weights after every close, even while a previously confirmed trade remains in the account.{" "}
          <a className={link} href="https://ijcai.org/proceedings/2013/296">Huang et al., IJCAI 2013</a></p></Prose>
        <h3 className="text-xl font-medium">Put five closes on a common scale</h3>
        <Prose><p>At close <Tex>{"t"}</Tex>, take that day and the four preceding sessions. Divide each Cola level by today’s Cola level and each AI level by today’s AI level.
          Each point now has two coordinates. Today lies at (1, 1). This lets a 1% displacement count equally on either axis even if the two indices have different starting units.</p></Prose>
        <Formula>{"z_s=\\left(\\frac{P_{C,s}}{P_{C,t}},\\frac{P_{A,s}}{P_{A,t}}\\right),\\qquad s=t-4,\\ldots,t"}</Formula>
        <h3 className="text-xl font-medium">Find the geometric median and read the forecast</h3>
        <Prose><p>The geometric <em>mean</em> summarizes compounded growth. Across the four intervals in the example below, Cola’s geometric mean daily return was
          {" "}<Tex>{"(95.970/96.839)^{1/4}-1\\approx-0.23\\%"}</Tex>. RMR needs a location in a two-dimensional price cloud. Its geometric <em>median</em> is the point with the smallest sum of straight-line distances to the five observations.</p></Prose>
        <Formula>{"m_t=\\arg\\min_{m\\in\\mathbb R^2}\\sum_{s=t-4}^{t}\\lVert z_s-m\\rVert_2,\\qquad \\widehat{x}_{t+1}=m_t"}</Formula>
        <Prose><p>The study first checks whether a recorded close minimizes this objective. Otherwise it iteratively reweights each point by the inverse of its distance from the current estimate
          (the modified Weiszfeld algorithm). Distant days exert less pull than they would in a squared-distance fit. Because today’s normalized close is one on both axes, the median coordinates directly give the forecast gross return multipliers.</p></Prose>
        <MedianFigure />
        <h3 className="text-xl font-medium">Update yesterday’s model weights</h3>
        <Prose><p>Initialize the model at (0.5, 0.5). For today’s forecast <Tex>{"\\widehat x"}</Tex>, its dot product with the previous model weights <Tex>{"b_t"}</Tex> gives the predicted multiplier if the weights stay put.
          RMR tries to move those weights as little as possible while raising the forecast portfolio multiplier toward its target <Tex>{"\\epsilon"}</Tex>.
          The original optimization expresses that preference for the smallest change in weights.</p></Prose>
        <Formula>{"\\min_{b\\in\\Delta}\\;\\tfrac12\\lVert b-b_t\\rVert_2^2\\qquad\\text{subject to}\\qquad b^\\top\\widehat x\\ge\\epsilon"}</Formula>
        <Prose><p>Here <Tex>{"\\Delta"}</Tex> contains the long-only weights that sum to one. To take the update, subtract the average forecast from both coordinates to get the direction <Tex>{"d"}</Tex>.
          This transfers weight toward the basket with the larger forecast while keeping the sum constant.</p></Prose>
        <Formula>{"\\bar x=(\\widehat x_C+\\widehat x_A)/2,\\quad d=\\widehat x-\\bar x\\mathbf1,\\quad \\lambda=\\max\\!\\left(0,\\frac{\\epsilon-b_t^\\top\\widehat x}{\\lVert d\\rVert_2^2}\\right)"}</Formula>
        <Prose><p>The numerator is the shortfall against the target. The squared length in the denominator converts that shortfall into a step along <Tex>{"d"}</Tex>.
          If the old weights meet the target, the step is zero. When both forecasts coincide, the implementation also sets it to zero because shifting money cannot improve the prediction.</p></Prose>
        <Formula>{"b_{t+1}=\\Pi_{\\Delta}(b_t+\\lambda d),\\qquad \\Delta=\\{b:\\ b_C,b_A\\ge0,\\ b_C+b_A=1\\}"}</Formula>
        <Prose><p>Projection chooses the closest feasible weights to the proposed step, so the portfolio cannot borrow or sell short.
          The experiment uses <Tex>{"\\epsilon=10"}</Tex>. That is an aggressive tuning parameter, far above forecasts near 1.00. Projection can leave the target unattainable.
          On May 2, the estimated multipliers were 1.0066 for Cola and 0.9742 for AI. The update put 100% model weight on Cola. Across this sample every projected allocation landed entirely in one basket.</p>
          <p>We normalized each five-close window after testing sensitivity to index units. In an earlier two-confirmation run, dividing just the AI index by ten changed 91 of 1,156 target decisions
            even though the underlying returns were identical. Normalizing removes that dependence on the choice of index units.</p></Prose>
      </Section>

      <Section id="decision" title="When does a model preference become an order?">
        <Prose><p>Following RMR directly would adopt each new daily allocation. In this study that would mean selling an entire basket every time the model changed its mind.
          Our trading rule accepts the first model signal from cash. Afterward the account keeps its confirmed target until the model favors the other basket at three consecutive closes.
          If the current target is favored again, the opposing count returns to zero. Consecutive five-close windows share four observations, so each confirmation is another reading of the same model.
          The rule adds a persistence requirement before paying to sell one basket and buy the other.</p></Prose>
        <ArticleTable caption="The first switch, starting with an AI position" columns={["2022 close", "Cola forecast gain", "AI forecast gain", "Cola streak", "Account decision"]}
          rows={study.example.map((day, i) => ({label: formatInsightDate(day.date).split(",")[0], cells: [
            signed(day.cola) + "%", signed(day.ai) + "%", actions[i][0], actions[i][1],
          ]}))} />
        <Prose><p>The April 25 signal disappeared the next day. Waiting avoided a round trip. On April 29 a two-signal rule would already have acted on the new sequence.
          Waiting for May 2 allowed the model one more chance to reverse, at the cost of entering later. Three is a design choice. It reduced turnover in this sample, and its profitability depended on the execution delay.</p>
          <p>At the May 3 close the account sold $86,959 of AI and bought $86,809 of Cola after spread and commission. AI then drew three signals on May 5, 6 and 9.
            The May 10 sale of Cola brought in $84,498, about $2,311 below its purchase value before the exit spread. Even a confirmed switch can lose money.</p></Prose>
      </Section>
      <Section id="ablations" title="Ablations and execution sensitivity"><Ablations /></Section>
      <Section id="strategy" title="The strategy, from closing prices to an executed switch">
        <ol className="grid gap-3 md:grid-cols-2">{strategy.map(([title, detail], i) =>
          <li key={title} className="surface flex gap-4 rounded-2xl p-4">
            <span className="text-2xl font-light tabular-nums text-brand">{i + 1}</span>
            <div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm leading-relaxed text-foreground/80">{detail}</p></div>
          </li>)}</ol>
        <StrategyWindow />
      </Section>
    </div>
  </article>;
}
