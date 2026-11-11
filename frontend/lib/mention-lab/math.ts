// The mathematics behind the site, in one place.
//
//  1. Counts:   Poisson base rate vs the Poisson–gamma (negative binomial) forecast of a word count.
//  2. PDEs:     the three layers of research/mentionpde.py (in-call filter, CARA pricing, robust HJB).
//  3. Sobolev:  the norms the Rellich test compares premium curves in.
//  4. Trading:  Kalshi fees and the value of each way to trade a strike.
//
// Ports of RAG/mention_forecast.py (SimpliEarn) and eventdist/mentionpde.py; lib/math.test.ts checks
// the ports against closed forms and against numbers those modules produce.

// ---------------------------------------------------------------- special functions

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905,
  -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos, |error| < 1e-13). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lead = a * Math.log(x) - x - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.min(1, sum * Math.exp(lead));
  }
  // Continued fraction for Q(a, x) (modified Lentz)
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.max(0, 1 - Math.exp(lead) * h);
}

/** Quantile of Gamma(shape, scale) by bisection on P. */
export function gammaQuantile(q: number, shape: number, scale: number): number {
  let lo = 0;
  let hi = Math.max(1, shape) * 10;
  while (gammaP(shape, hi) < q) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(shape, mid) < q) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * scale;
}

// ---------------------------------------------------------------- 1. counts

export function poissonPmf(x: number, lam: number): number {
  if (lam <= 0) return x === 0 ? 1 : 0;
  return Math.exp(x * Math.log(lam) - lam - lgamma(x + 1));
}

/** Negative binomial P(X = x), size r, success probability p (mean r(1−p)/p). */
export function nbPmf(x: number, r: number, p: number): number {
  return Math.exp(lgamma(x + r) - lgamma(r) - lgamma(x + 1) + r * Math.log(p) + x * Math.log1p(-p));
}

function exceed(pmf: (x: number) => number, k: number): number {
  if (k <= 0) return 1;
  let s = 0;
  for (let x = 0; x < k; x++) s += pmf(x);
  return Math.min(1, Math.max(0, 1 - s));
}

export const poissonExceed = (k: number, lam: number) => exceed((x) => poissonPmf(x, lam), k);
export const nbExceed = (k: number, r: number, p: number) => exceed((x) => nbPmf(x, r, p), k);

/** NB (r, p) from a mean and a dispersion α, variance λ̄ + αλ̄² (the parametrization of mentionpde.py). */
export function nbFromAlpha(mean: number, alpha: number): { r: number; p: number } {
  const r = 1 / alpha;
  return { r, p: r / (r + mean) };
}

export function nbFromMoments(mean: number, variance: number): { r: number; p: number } {
  const v = Math.max(variance, mean * (1 + 1e-9));
  const r = (mean * mean) / (v - mean);
  return { r, p: r / (r + mean) };
}

// Gamma shape of λ across calls assumed before the data says otherwise (CV 1/√30 ≈ 18%), and the
// pseudo-calls it is worth. Chosen walk-forward on Apple's six calls in SimpliEarn; see the README.
export const PRIOR_DISPERSION = 30;
export const PRIOR_CALLS = 2;

export interface NbFit {
  nCalls: number;
  mean: number;
  variance: number;
  sampleVariance: number | null;
  betweenCallVariance: number;
  weightOnData: number;
  r: number;
  p: number;
}

/** Poisson–gamma predictive for the next call's count: variance = μ + τ² + (μ + τ²)/n. */
export function fitNegativeBinomial(counts: number[]): NbFit {
  const n = counts.length;
  if (n === 0) throw new Error("At least one call's count is needed");
  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total > 0 ? total / n : 0.5 / (n + 1);
  const sampleVariance = n >= 2 ? counts.reduce((a, c) => a + (c - mean) ** 2, 0) / (n - 1) : null;
  const measured = sampleVariance !== null ? Math.max(0, sampleVariance - mean) : 0;
  const weightOnData = n >= 2 ? (n - 1) / (n - 1 + PRIOR_CALLS) : 0;
  const tau2 = weightOnData * measured + ((1 - weightOnData) * mean * mean) / PRIOR_DISPERSION;
  const variance = mean + tau2 + (mean + tau2) / n;
  const { r, p } = nbFromMoments(mean, variance);
  return { nCalls: n, mean, variance, sampleVariance, betweenCallVariance: tau2, weightOnData, r, p };
}

/** λ at which a Poisson base rate prices "at least k" at `price`. */
export function impliedPoissonLambda(price: number, k: number): number | null {
  if (!(price > 0 && price < 1) || k < 1) return null;
  let lo = 0;
  let hi = 1;
  while (poissonExceed(k, hi) < price) {
    hi *= 2;
    if (hi > 1e4) return null;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (poissonExceed(k, mid) < price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Closest non-increasing sequence in least squares (pool adjacent violators). */
export function monotoneDecreasing(values: number[]): number[] {
  const blocks: { v: number; n: number }[] = [];
  for (const v of values) {
    blocks.push({ v, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v < blocks[blocks.length - 1].v) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({ v: (a.v * a.n + b.v * b.n) / (a.n + b.n), n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => Array(b.n).fill(b.v));
}

/** Mean of the NB with size r whose ladder best fits `probs` (golden section on log mean). */
export function fitNbMeanToLadder(strikes: number[], probs: number[], r: number): number {
  const loss = (logMean: number) => {
    const p = r / (r + Math.exp(logMean));
    return strikes.reduce((s, k, i) => s + (nbExceed(k, r, p) - probs[i]) ** 2, 0);
  };
  let a = Math.log(0.01);
  let b = Math.log(Math.max(...strikes) * 4 + 10);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 80; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (loss(c) < loss(d)) b = d;
    else a = c;
  }
  return Math.exp((a + b) / 2);
}

const P_FLOOR = 0.005;
const logit = (p: number) => {
  const q = Math.min(1 - P_FLOOR, Math.max(P_FLOOR, p));
  return Math.log(q / (1 - q));
};

/** (1 − w)·logit(model) + w·logit(LLM), back to a probability. */
export function blend(model: number, llm: number, w: number): number {
  return 1 / (1 + Math.exp(-((1 - w) * logit(model) + w * logit(llm))));
}

export function defaultStrikes(mean: number): number[] {
  const raw = [1, 0.5, 0.75, 1, 1.25, 1.5, 2].map((f, i) => (i === 0 ? 1 : Math.round(mean * f)));
  return [...new Set(raw)].filter((k) => k >= 1).sort((a, b) => a - b).slice(0, 8);
}

export interface WalkForwardRow {
  label: string;
  actual: number;
  forecastMean: number;
  nbLogScore: number;
  poissonLogScore: number;
}

/** Forecast each call from the calls before it; log score of what happened under NB and Poisson. */
export function walkForward(counts: number[], labels: string[], window: number): WalkForwardRow[] {
  const rows: WalkForwardRow[] = [];
  for (let t = 1; t < counts.length; t++) {
    const fit = fitNegativeBinomial(counts.slice(Math.max(0, t - window), t));
    const actual = counts[t];
    rows.push({
      label: labels[t],
      actual,
      forecastMean: fit.mean,
      nbLogScore: Math.log(Math.max(nbPmf(actual, fit.r, fit.p), 1e-12)),
      poissonLogScore: Math.log(Math.max(poissonPmf(actual, fit.mean), 1e-12)),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- 2. the mention-market PDEs

// Layer 0: P(N ≥ 1) under NB with mean λ̄ and dispersion α, its inverse, and its verbosity beta.
export const nbP = (lbar: number, alpha = 0.25) => 1 - (1 + alpha * lbar) ** (-1 / alpha);
export function nbLamFromP(p: number, alpha = 0.25): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return ((1 - q) ** -alpha - 1) / alpha;
}
/** ∂P(N ≥ 1)/∂ ln v: a YES contract's exposure to the call's common verbosity factor. */
export const nbBeta = (lbar: number, alpha = 0.25) => lbar * (1 + alpha * lbar) ** (-1 / alpha - 1);

/** Layer 1: fair YES price after τ of silence, V = 1 − (b/(b + T − τ))^a with b = b0 + τ. */
export function incallPrice(tau: number, a: number, b0: number, T = 1): number {
  const b = b0 + tau;
  return 1 - (b / (b + T - tau)) ** a;
}

/** The same contract under a Poisson rate that is known, so silence teaches nothing. */
export const poissonIncallPrice = (tau: number, lam: number, T = 1) => 1 - Math.exp(-lam * (T - tau));

/** Layer 2: CARA certainty equivalent of a YES paying 1 with probability π. */
export function caraCe(pi: number, g: number): number {
  if (Math.abs(g) < 1e-9) return pi;
  return -Math.log(1 - pi + pi * Math.exp(-g)) / g;
}

/** Probability whose CARA certainty equivalent is `price`. */
export function caraInverse(price: number, g: number): number {
  if (Math.abs(g) < 1e-9) return price;
  return (1 - Math.exp(-g * price)) / (1 - Math.exp(-g));
}

/** Solve dCE/dτ = −(λ/γ)(1 − e^{−γ(1−CE)}) backward from CE(T) = 0 with RK4; CE(0). */
export function caraOde(lam: number, g: number, T = 1, n = 4000): number {
  const h = T / n;
  const f = (v: number) => (lam / g) * (1 - Math.exp(-g * (1 - v)));
  let v = 0;
  for (let i = 0; i < n; i++) {
    const k1 = f(v);
    const k2 = f(v + (h * k1) / 2);
    const k3 = f(v + (h * k2) / 2);
    const k4 = f(v + h * k3);
    v += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
  }
  return v;
}

/**
 * Layer 3: upper (or lower) value of a book of YES positions when the verbosity v is only known to
 * lie in [vLo, vHi]. Words are grouped in buckets g of n_g words with rate θ_g; the state k counts
 * words already said per bucket. Explicit backward steps of
 *     ∂V/∂τ + sup_v v Σ_g θ_g (n_g − k_g)[V(k + e_g) − V(k)] = 0,   V(T, k) = Σ c_g k_g.
 */
export function robustValue(n: number[], theta: number[], c: number[], vLo: number, vHi: number, upper = true, T = 1, steps = 400): number {
  const G = n.length;
  const states: number[][] = [[]];
  for (let g = 0; g < G; g++) {
    const next: number[][] = [];
    for (const s of states) for (let k = 0; k <= n[g]; k++) next.push([...s, k]);
    states.splice(0, states.length, ...next);
  }
  const key = (s: number[]) => s.join(",");
  const index = new Map(states.map((s, i) => [key(s), i]));
  const nxt = states.map((s) =>
    s.map((k, g) => (k < n[g] ? index.get(key(s.map((v, j) => (j === g ? v + 1 : v))))! : -1)),
  );
  let V = states.map((s) => s.reduce((a, k, g) => a + c[g] * k, 0));
  const totalRate = theta.reduce((a, t, g) => a + t * n[g], 0);
  if ((T / steps) * Math.max(vHi, 1e-9) * totalRate > 1) steps = Math.ceil(T * vHi * totalRate * 1.2);
  const h = T / steps;
  for (let step = 0; step < steps; step++) {
    const W = V.slice();
    for (let i = 0; i < states.length; i++) {
      let jump = 0;
      for (let g = 0; g < G; g++) {
        if (nxt[i][g] >= 0) jump += theta[g] * (n[g] - states[i][g]) * (V[nxt[i][g]] - V[i]);
      }
      const v = upper ? (jump >= 0 ? vHi : vLo) : jump >= 0 ? vLo : vHi;
      W[i] = V[i] + h * v * jump;
    }
    V = W;
  }
  return V[0];
}

/** Known v: words are independent, V = Σ c_g n_g (1 − e^{−vθ_g T}). */
export function fairValue(n: number[], theta: number[], c: number[], v = 1, T = 1): number {
  return n.reduce((a, ng, g) => a + c[g] * ng * (1 - Math.exp(-v * theta[g] * T)), 0);
}

/** Interval of plausible intensities: q-quantiles of Gamma(shape 1/α, mean λ̄). */
export function gammaBand(lbar: number, alpha = 0.25, q: [number, number] = [0.1, 0.9]): [number, number] {
  const k = 1 / alpha;
  return [gammaQuantile(q[0], k, lbar / k), gammaQuantile(q[1], k, lbar / k)];
}

// ---------------------------------------------------------------- 3. Sobolev norms

/** Gaussian-kernel regression of z on u, evaluated on grid. */
export function kernelCurve(u: number[], z: number[], grid: number[], bw = 0.08): number[] {
  return grid.map((g) => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < u.length; i++) {
      const w = Math.exp(-0.5 * ((g - u[i]) / bw) ** 2);
      num += w * z[i];
      den += w;
    }
    return num / Math.max(den, 1e-12);
  });
}

/** Discrete L2, H¹ and H⁻¹ norms of a curve on an interval (H⁻¹ via the centred antiderivative). */
export function sobolevNorms(f: number[], grid: number[]): { L2: number; H1: number; Hm1: number } {
  const n = f.length;
  const dx = grid[1] - grid[0];
  const L = grid[n - 1] - grid[0];
  const l2sq = (f.reduce((a, v) => a + v * v, 0) * dx) / L;
  let d2 = 0;
  for (let i = 0; i < n; i++) {
    const d = i === 0 ? (f[1] - f[0]) / dx : i === n - 1 ? (f[n - 1] - f[n - 2]) / dx : (f[i + 1] - f[i - 1]) / (2 * dx);
    d2 += d * d;
  }
  let acc = 0;
  const F = f.map((v) => (acc += v * dx));
  const Fm = F.reduce((a, v) => a + v, 0) / n;
  return {
    L2: Math.sqrt(l2sq),
    H1: Math.sqrt(l2sq + (d2 * dx) / L),
    Hm1: Math.sqrt((F.reduce((a, v) => a + (v - Fm) ** 2, 0) * dx) / L),
  };
}

// ---------------------------------------------------------------- 4. trading

export const TAKER_FEE_RATE = 0.07;
export const MAKER_FEE_RATE = 0.0175;
export const kalshiFee = (price: number, rate: number) => rate * price * (1 - price);

export interface TradeRow {
  strike: number;
  market: number;
  fair: number;
  edge: number;
  impliedLambda: number | null;
  makerSellYes: number;
  makerBuyYes: number;
  takerYes: number;
  takerNo: number;
  suggestion: string;
  suggestionEv: number;
}

/** Expected value per $1 contract of each way to trade one strike, after fees. */
export function tradeRow(strike: number, fair: number, mid: number, spread: number, minEdge: number): TradeRow {
  const bid = Math.max(0.01, mid - spread / 2);
  const ask = Math.min(0.99, mid + spread / 2);
  const options: [string, number][] = [
    ["Rest a YES offer at the mid (sell YES)", mid - fair - kalshiFee(mid, MAKER_FEE_RATE)],
    ["Rest a YES bid at the mid (buy YES)", fair - mid - kalshiFee(mid, MAKER_FEE_RATE)],
    ["Buy YES at the ask", fair - ask - kalshiFee(ask, TAKER_FEE_RATE)],
    ["Buy NO at the bid", bid - fair - kalshiFee(bid, TAKER_FEE_RATE)],
  ];
  const [action, ev] = options.reduce((best, o) => (o[1] > best[1] ? o : best));
  return {
    strike,
    market: mid,
    fair,
    edge: fair - mid,
    impliedLambda: impliedPoissonLambda(mid, strike),
    makerSellYes: options[0][1],
    makerBuyYes: options[1][1],
    takerYes: options[2][1],
    takerNo: options[3][1],
    suggestion: ev >= minEdge ? action : "No trade",
    suggestionEv: ev,
  };
}

/** Evenly spaced points from a to b inclusive. */
export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
