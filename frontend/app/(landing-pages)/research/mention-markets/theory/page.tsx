import type { Metadata } from "next";
import Link from "next/link";
import CaraWidget from "@/components/mention-lab/theory/CaraWidget";
import HjbWidget from "@/components/mention-lab/theory/HjbWidget";
import IncallWidget from "@/components/mention-lab/theory/IncallWidget";
import NbWidget from "@/components/mention-lab/theory/NbWidget";
import { NormToy, RellichEvidence } from "@/components/mention-lab/theory/RellichWidget";
import { Callout, PageHeader, Prose, Section, Tex } from "@/components/mention-lab/ui";
import { findings, pde } from "@/lib/mention-lab/data";

export const metadata: Metadata = { title: "Theory | SimpliEarn" };

const TOC = [
  ["contract", "0", "The contract"],
  ["nb", "1", "Negative binomial"],
  ["pde", "2", "Mention markets as PDEs"],
  ["rellich", "3", "The Rellich theorem"],
  ["together", "4", "Putting it together"],
];

const c = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(1)}¢`;

export default function TheoryPage() {
  const L = findings.lambda;
  const R = pde.rellich;
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-20">
      <PageHeader eyebrow="Theory" title="Why the strategy should work">
        Three pieces of mathematics, each tied to one fact in the data. The negative binomial says what a fair price is. The pricing PDEs
        explain why Kalshi prices sit above it and how a book of them behaves. The Rellich theorem justifies treating that gap as one stable
        curve that can be estimated from the past and traded in the future.
      </PageHeader>

      <div className="mb-14 flex max-w-3xl justify-center">
        <nav
          className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/8 bg-[rgba(17,20,19,0.72)] px-2 py-2 text-sm backdrop-blur-xl"
          aria-label="Theory sections"
        >
          {TOC.map(([id, n, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-lg px-2.5 py-1 whitespace-nowrap text-foreground no-underline transition-colors hover:text-brand"
            >
              <span className="text-brand">{n}</span> {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-20">
        <Section id="contract" number="0" title="The contract">
          <Prose>
            <p>
              A Kalshi earnings-mention market on word <Tex>{"w"}</Tex> and strike <Tex>{"k"}</Tex> pays $1 if management says <Tex>{"w"}</Tex> at
              least <Tex>{"k"}</Tex> times on the call: prepared remarks and answers count, analysts&rsquo; questions and the operator do not, and
              plurals and possessives count. With <Tex>{"N_w"}</Tex> the count, the fair price of YES is
            </p>
            <Tex block>{"\\text{YES}_{w,k} \\;=\\; \\Pr(N_w \\ge k).\\qquad \\text{Most listed markets are } k = 1."}</Tex>
            <p>
              Everything below is about the distribution of <Tex>{"N_w"}</Tex> before the call, how its price should move during the call, and
              what the prices people actually pay tell us about them.
            </p>
          </Prose>
        </Section>

        <Section id="nb" number="1" title="Negative binomial: the rate is not known">
          <Prose>
            <p>
              The base-rate way to price a mention: take the average count over recent calls, <Tex>{"\\bar\\lambda"}</Tex>, and treat the count
              as Poisson,
            </p>
            <Tex block>{"N \\sim \\text{Poisson}(\\bar\\lambda),\\qquad \\Pr(N \\ge k) = 1 - \\sum_{j<k} e^{-\\bar\\lambda}\\frac{\\bar\\lambda^{j}}{j!}."}</Tex>
            <p>
              That treats the rate as known. It is not: management talks more about a topic some quarters than others, and <Tex>{"\\bar\\lambda"}</Tex>{" "}
              is an average of a handful of calls. Let the call&rsquo;s rate itself be random,{" "}
              <Tex>{"\\lambda \\sim \\text{Gamma}(\\text{shape } 1/\\alpha,\\ \\text{mean } \\bar\\lambda)"}</Tex>, and the count Poisson given the
              rate. Integrating the rate out gives the negative binomial:
            </p>
            <Tex block>
              {"\\Pr(N=n) = \\int_0^\\infty \\frac{e^{-\\lambda}\\lambda^n}{n!}\\, g(\\lambda)\\, d\\lambda = \\frac{\\Gamma(n+r)}{\\Gamma(r)\\, n!}\\, p^{\\,r}(1-p)^n,\\qquad r = \\tfrac1\\alpha,\\ \\ p = \\frac{r}{r+\\bar\\lambda},"}
            </Tex>
            <Tex block>{"\\mathbb E N = \\bar\\lambda,\\qquad \\operatorname{Var} N = \\bar\\lambda + \\alpha\\bar\\lambda^2,\\qquad \\Pr(N\\ge 1) = 1-(1+\\alpha\\bar\\lambda)^{-1/\\alpha}."}</Tex>
            <p>
              Same mean, more spread. Because <Tex>{"\\lambda \\mapsto e^{-\\lambda}"}</Tex> is convex, Jensen&rsquo;s inequality gives{" "}
              <Tex>{"\\mathbb E\\, e^{-\\lambda} \\ge e^{-\\bar\\lambda}"}</Tex>: the chance the word is <em>never</em> said is higher than Poisson
              thinks, so near-certain strikes are worth less. The same extra spread fattens the right tail, so long shots are worth more.
            </p>
          </Prose>
          <NbWidget />
          <Prose>
            <p>
              For forecasting a single company&rsquo;s next call (the <Link href="/research/mention-markets/forecaster">Forecaster</Link>), the spread has three sources,
              all estimated from that company&rsquo;s past <Tex>{"n"}</Tex> calls:
            </p>
            <Tex block>{"\\operatorname{Var}(N_{\\text{next}}) \\;=\\; \\underbrace{\\mu}_{\\text{Poisson noise}} \\;+\\; \\underbrace{\\tau^2}_{\\text{call-to-call}} \\;+\\; \\underbrace{(\\mu+\\tau^2)/n}_{\\text{not knowing } \\mu}."}</Tex>
          </Prose>
          <Callout title="Evidence">
            On {L.rows.toLocaleString()} company-word pairs from earnings transcripts ({L.calls_from} to {L.calls_to}), forecasting each call from
            earlier ones, the NB beats the Poisson base rate at every strike: Brier score at <Tex>{"k\\ge1"}</Tex> {L.brier_k1.nb_model.toFixed(4)} vs{" "}
            {L.brier_k1.poisson.toFixed(4)}, at <Tex>{"k\\ge3"}</Tex> {L.brier_k3.nb_model.toFixed(4)} vs {L.brier_k3.poisson.toFixed(4)}, at{" "}
            <Tex>{"k\\ge10"}</Tex> {L.brier_k10.nb_model.toFixed(4)} vs {L.brier_k10.poisson.toFixed(4)}. Kalshi does not make the Poisson mistake at
            the top: 85–95¢ markets settle YES about as often as priced. So the NB is not a free lunch by itself. Its job in the strategy is to
            say <em>where</em> the market is most likely too high.
          </Callout>
        </Section>

        <Section id="pde" number="2" title="Mention markets as nonlinear PDEs">
          <Prose>
            <p>
              Put time into the model. The call runs over <Tex>{"\\tau \\in [0, T]"}</Tex> (normalised to <Tex>{"T = 1"}</Tex>). Given the call, word{" "}
              <Tex>{"w"}</Tex> arrives as a Poisson process with intensity <Tex>{"\\lambda_w v"}</Tex>: a word-specific rate <Tex>{"\\lambda_w"}</Tex>{" "}
              (gamma-distributed, as above) times a <strong>verbosity</strong> factor <Tex>{"v"}</Tex> shared by every word on the call (a long,
              talkative call lifts all of them; <Tex>{"\\mathbb E v = 1"}</Tex>). Three layers of PDEs follow, each adding one ingredient and one
              degree of nonlinearity.
            </p>
          </Prose>

          <h3 className="mt-4 text-xl font-light">2.1 The in-call filter (first-order, hyperbolic)</h3>
          <Prose>
            <p>
              While the word has not been said, Bayes updates the gamma posterior on the rate: shape <Tex>{"a"}</Tex> stays fixed, the exposure{" "}
              <Tex>{"b = b_0 + \\tau"}</Tex> grows. The hazard of a first mention is the posterior mean <Tex>{"a/b"}</Tex>, so the fair price{" "}
              <Tex>{"V(\\tau, b)"}</Tex> of &ldquo;said at least once&rdquo; solves a transport equation along the characteristic{" "}
              <Tex>{"b = b_0+\\tau"}</Tex>:
            </p>
            <Tex block>{"\\partial_\\tau V + \\partial_b V + \\frac{a}{b}\\,(1-V) = 0,\\qquad V(T,b)=0\\quad\\Longrightarrow\\quad V(\\tau,b) = 1-\\Big(\\frac{b}{b+T-\\tau}\\Big)^{a}."}</Tex>
            <p>
              With a known rate the price would decay like <Tex>{"1-e^{-\\lambda(T-\\tau)}"}</Tex>, because only the remaining time shrinks. In the
              filter, silence also lowers the estimate of the rate. The price falls faster than the Poisson clock.
            </p>
          </Prose>
          <IncallWidget />
          <Callout title="What it means for trading">
            During the call, every silent minute is information, and a resting order is repriced against you by anyone running this filter. That
            is why the strategy quotes once, before the call (07:00 ET on the call date), and does not leave stale orders working into it.
          </Callout>

          <h3 className="mt-4 text-xl font-light">2.2 Risk preference (semilinear): the YES premium</h3>
          <Prose>
            <p>
              Suppose the marginal YES buyer has constant absolute risk aversion <Tex>{"\\gamma"}</Tex> and values a YES at its certainty
              equivalent. With the word arriving at rate <Tex>{"\\lambda"}</Tex>, the certainty equivalent solves a semilinear ODE in call time, and
              it has a closed form at the open:
            </p>
            <Tex block>{"\\frac{d\\,CE}{d\\tau} + \\frac{\\lambda}{\\gamma}\\big(1 - e^{-\\gamma(1-CE)}\\big) = 0,\\qquad CE(T)=0,"}</Tex>
            <Tex block>{"\\Longrightarrow\\qquad CE(0) = -\\frac1\\gamma\\ln\\!\\big(1-\\pi+\\pi e^{-\\gamma}\\big),\\qquad \\pi=\\Pr(\\text{YES}) = 1-e^{-\\lambda T}."}</Tex>
            <p>
              <Tex>{"\\gamma > 0"}</Tex> is ordinary risk aversion and makes YES cheap. <Tex>{"\\gamma < 0"}</Tex> is a taste for lottery tickets
              and makes YES trade above its probability. Inverting the formula turns each market price into the probability it implies,{" "}
              <Tex>{"\\pi = (1-e^{-\\gamma P})/(1-e^{-\\gamma})"}</Tex>, so <Tex>{"\\gamma"}</Tex> can be fitted by maximum likelihood from prices and
              outcomes.
            </p>
          </Prose>
          <CaraWidget />
          <Callout title="Evidence">
            Fitted on {pde.markets.toLocaleString()} Kalshi mention markets priced 5–90¢ ({pde.events} calls):{" "}
            <Tex>{`\\hat\\gamma = ${pde.cara.gamma.toFixed(2)}`}</Tex> (s.e. {pde.cara.se.toFixed(2)}), clearly negative. YES buyers pay up for the
            lottery. By season the estimate runs from{" "}
            {Math.min(...pde.cara.by_season.map((s) => s.gamma)).toFixed(2)} to {Math.max(...pde.cara.by_season.map((s) => s.gamma)).toFixed(2)} and
            drifts toward zero: the premium is shrinking by about {Math.abs(pde.hedge_reported.premium_trend_c_per_season).toFixed(1)}¢ a season (t{" "}
            {pde.hedge_reported.premium_trend_t.toFixed(1)}). This premium is what a seller of YES collects.
          </Callout>

          <h3 className="mt-4 text-xl font-light">2.3 Uncertain verbosity (fully nonlinear HJB): a whole book</h3>
          <Prose>
            <p>
              A market maker holds many words from the same call, and they share <Tex>{"v"}</Tex>. Group the words into buckets{" "}
              <Tex>{"g"}</Tex> of <Tex>{"n_g"}</Tex> words with rate <Tex>{"\\theta_g"}</Tex>, let <Tex>{"k_g"}</Tex> count those already said, and
              hold <Tex>{"c_g"}</Tex> YES per word. If verbosity is only known to lie in <Tex>{"[v^-, v^+]"}</Tex>, the worst-case (super-replication)
              value solves a Hamilton–Jacobi–Bellman equation:
            </p>
            <Tex block>{"\\partial_\\tau V + \\sup_{v\\in[v^-,v^+]}\\; v\\sum_g \\theta_g\\,(n_g-k_g)\\,\\big[V(k+e_g)-V(k)\\big] = 0,\\qquad V(T,k)=\\sum_g c_g k_g,"}</Tex>
            <p>
              and the lower value uses <Tex>{"\\inf"}</Tex>. For a one-sided book the bracket has one sign and the sup is just <Tex>{"v^+"}</Tex>. For a
              hedged long/short book it changes sign from state to state, which makes the equation genuinely nonlinear. The width{" "}
              <Tex>{"V^+-V^-"}</Tex> is the verbosity risk left after hedging. Each YES has verbosity exposure
            </p>
            <Tex block>{"\\beta_w = \\frac{\\partial \\Pr(N_w\\ge1)}{\\partial \\ln v} = \\bar\\lambda_w\\,(1+\\alpha\\bar\\lambda_w)^{-1/\\alpha-1},"}</Tex>
            <p>
              so short one YES on word A and long <Tex>{"\\beta_A/\\beta_B"}</Tex> YES on word B is verbosity-neutral to first order.
            </p>
          </Prose>
          <HjbWidget />
          <Callout title="Evidence">
            In the data the common factor is tiny: within one call, the correlation of outcome surprises across words is{" "}
            <Tex>{`\\rho = ${pde.within_event_rho.toFixed(3)}`}</Tex>. A beta-neutral book keeps only {pde.hedge_reported.beta_neutral_c.toFixed(1)}¢
            per contract against {pde.hedge_reported.unhedged_c.toFixed(1)}¢ unhedged: it pays fees and gives up premium on the long leg to remove a
            risk that is barely there. The theory says when hedging helps. The data says it does not help here. Diversify across calls instead.
          </Callout>
        </Section>

        <Section id="rellich" number="3" title="The Rellich theorem: one stable premium curve">
          <Prose>
            <p>
              Sections 1–2 say why selling YES should earn a premium, and that the premium depends on price. Trading it needs one more thing: that
              the premium curve estimated from past seasons is the curve the next season will pay. That is a question about convergence of
              functions, and the tool for it is compactness.
            </p>
            <p>
              <strong>Theorem (Rellich–Kondrachov).</strong> Let <Tex>{"\\Omega"}</Tex> be a bounded interval (or bounded Lipschitz domain) and{" "}
              <Tex>{"s > t"}</Tex>. The embedding <Tex>{"H^s(\\Omega) \\hookrightarrow H^t(\\Omega)"}</Tex> is compact: every sequence bounded in{" "}
              <Tex>{"H^s"}</Tex> has a subsequence that converges in <Tex>{"H^t"}</Tex>. With <Tex>{"s=1, t=0"}</Tex>: functions with bounded energy
              in their slopes have <Tex>{"L^2"}</Tex>-convergent subsequences. It is Bolzano–Weierstrass for functions.
            </p>
            <p>The reason is a uniform tail bound. Writing <Tex>{"f_j"}</Tex> for Fourier coefficients and <Tex>{"\\|f\\|_{H^s}^2 \\le M"}</Tex>,</p>
            <Tex block>{"\\sum_{|j|>J}(1+j^2)^{t}\\,|f_j|^2 \\;\\le\\; (1+J^2)^{t-s}\\sum_{|j|>J}(1+j^2)^{s}|f_j|^2 \\;\\le\\; (1+J^2)^{t-s}M \\;\\xrightarrow[J\\to\\infty]{}\\; 0."}</Tex>
            <p>
              Uniformly over the whole family, all but finitely many modes are negligible, so the family is essentially finite-dimensional, and
              bounded sets in finite dimensions are compact.
            </p>
          </Prose>

          <h3 className="mt-4 text-xl font-light">The translation</h3>
          <Prose>
            <p>
              Take <Tex>{"\\Omega = [0.05,\\ 0.90]"}</Tex>, the price range traded (5¢ to 90¢). For each reporting season <Tex>{"S"}</Tex>, let{" "}
              <Tex>{"f_S(p)"}</Tex> be the maker premium curve: the average after-fee profit of selling YES at the 07:00 mid <Tex>{"p"}</Tex>,
              kernel-smoothed over that season&rsquo;s markets. Smoothing keeps every <Tex>{"f_S"}</Tex> bounded in <Tex>{"H^1"}</Tex> (the table
              below lists the norms), so Rellich says the family <Tex>{"\\{f_S\\}"}</Tex> is precompact in <Tex>{"L^2"}</Tex> and in the weaker{" "}
              <Tex>{"H^{-1}"}</Tex>: it has limit points.
            </p>
            <p>
              Compactness gives limit points, not one limit. The strategy needs the stronger claim, that every season is a noisy draw around a single{" "}
              <Tex>{"f^\\ast"}</Tex>. So it is tested. The statistic sums how far each season sits from all the others,
            </p>
            <Tex block>{"D = \\sum_S \\big\\| f_S - f_{-S} \\big\\|,\\qquad \\|g\\|_{H^{-1}} \\approx \\Big\\| G - \\bar G \\Big\\|_{L^2},\\ \\ G(p)=\\int_{0.05}^{p} g,"}</Tex>
            <p>
              and the null shuffles whole calls across seasons. The <Tex>{"H^{-1}"}</Tex> norm measures a curve through its antiderivative, the
              cumulative premium of a book that sells YES at every price up to <Tex>{"p"}</Tex>. That is the quantity a maker earns, and it ignores
              the fast wiggles thin markets add to each season&rsquo;s curve:
            </p>
          </Prose>
          <NormToy />
          <RellichEvidence />
          <Callout title="Result">
            Observed seasonal spread vs shuffled seasons: p = {R.p.Hm1.toFixed(2)} in <Tex>{"H^{-1}"}</Tex>, p = {R.p.L2.toFixed(2)} in{" "}
            <Tex>{"L^2"}</Tex>. Nothing distinguishes the real seasons from random relabelings, so they are consistent with one limit curve, which
            is positive across the whole range (about {c(pde.maker_short_yes.mean)} per contract on average). That licenses estimating the curve
            from the pooled past and applying it to the next season. It is not proof of permanence: the mean premium is drifting down, and the
            latest partial season is the weakest.
          </Callout>
        </Section>

        <Section id="together" number="4" title="Putting it together">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {[
              ["Negative binomial", "What a contract is worth. Poisson-style pricing is wrong in both tails. The NB gap to the mid ranks where to quote."],
              ["In-call filter PDE", "Silence is information, so quote before the call and do not leave stale orders working into it."],
              ["CARA pricing PDE", `YES buyers are lottery-seeking (γ̂ = ${pde.cara.gamma.toFixed(2)}). Sell them YES: the premium is the edge.`],
              ["Robust HJB", `Verbosity risk is real in theory but tiny in data (ρ = ${pde.within_event_rho.toFixed(3)}). Don't hedge; spread across calls.`],
              ["Rellich–Kondrachov", "Seasonal premium curves are consistent with one limit, so the past curve is a fair estimate of the next season's."],
            ].map(([t, d]) => (
              <div key={t} className="surface rounded-2xl p-5">
                <p className="mb-1 font-medium text-brand">{t}</p>
                <p className="text-sm leading-relaxed text-foreground/80">{d}</p>
              </div>
            ))}
            <Link href="/research/mention-markets/strategy" className="surface flex flex-col justify-center rounded-2xl border-brand/30 p-5 no-underline hover:bg-white/5">
              <p className="mb-1 font-medium text-foreground">The strategy →</p>
              <p className="text-sm leading-relaxed text-muted-foreground">The rule, the numbers behind it, and a quote builder.</p>
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
