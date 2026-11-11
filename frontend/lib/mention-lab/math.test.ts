import { test } from "node:test";
import assert from "node:assert/strict";

import * as m from "./math.ts";

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("lgamma and incomplete gamma", () => {
  close(m.lgamma(5), Math.log(24), 1e-10);
  close(m.lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-10);
  close(m.gammaP(1, 2), 1 - Math.exp(-2), 1e-10); // exponential CDF
  close(m.gammaP(3, 10), 0.9972306042844884, 1e-12); // scipy.special.gammainc(3, 10)
  close(m.gammaQuantile(m.gammaP(4, 3.3), 4, 1), 3.3, 1e-8);
});

test("NB fit matches RAG/mention_forecast.py", () => {
  const f = m.fitNegativeBinomial([3, 5, 8, 4, 6]);
  close(f.mean, 5.2);
  assert.ok(f.variance > f.mean);
  let s = 0;
  let mean = 0;
  for (let x = 0; x < 200; x++) {
    s += m.nbPmf(x, f.r, f.p);
    mean += x * m.nbPmf(x, f.r, f.p);
  }
  close(s, 1);
  close(mean, f.mean);
  // Apple "AI" counts: the Python service gives mean 7 and these ladder values
  const ai = m.fitNegativeBinomial([7, 6, 12, 8, 6, 3]);
  close(m.nbExceed(7, ai.r, ai.p), 0.523, 1e-3);
  close(m.poissonExceed(7, 7), 0.55, 1e-3);
});

test("NB is wider than Poisson in both tails", () => {
  const f = m.fitNegativeBinomial([3, 5, 8, 4, 6]);
  assert.ok(m.poissonExceed(1, f.mean) > m.nbExceed(1, f.r, f.p));
  assert.ok(m.poissonExceed(12, f.mean) < m.nbExceed(12, f.r, f.p));
});

test("implied lambda round trip, monotone ladder, NB mean fit, blend", () => {
  close(m.impliedPoissonLambda(m.poissonExceed(5, 4.2), 5)!, 4.2, 1e-6);
  assert.deepEqual(
    m.monotoneDecreasing([0.9, 0.95, 0.6, 0.7, 0.2]).map((v) => +v.toFixed(3)),
    [0.925, 0.925, 0.65, 0.65, 0.2],
  );
  const { r } = m.fitNegativeBinomial([8, 12, 10]);
  const p = r / (r + 9);
  const strikes = [3, 6, 10, 14];
  close(m.fitNbMeanToLadder(strikes, strikes.map((k) => m.nbExceed(k, r, p)), r), 9, 1e-2);
  close(m.blend(0.3, 0.9, 0), 0.3);
  close(m.blend(0.3, 0.9, 1), 0.9);
});

test("in-call filter solves its transport PDE", () => {
  const a = 4;
  const b0 = 4;
  const h = 1e-5;
  for (const tau of [0.1, 0.4, 0.8]) {
    const V = m.incallPrice(tau, a, b0);
    const dV = (m.incallPrice(tau + h, a, b0) - m.incallPrice(tau - h, a, b0)) / (2 * h); // along b = b0 + τ
    close(dV + (a / (b0 + tau)) * (1 - V), 0, 1e-6);
  }
  // Silence lowers the Bayesian price faster than a known-rate Poisson price
  assert.ok(m.incallPrice(0.5, a, b0) < m.poissonIncallPrice(0.5, a / b0));
  close(m.incallPrice(0, a, b0), 1 - (4 / 5) ** 4);
});

test("CARA ODE matches its closed form; gamma < 0 puts YES above probability", () => {
  const lam = 0.7;
  const pi = 1 - Math.exp(-lam);
  for (const g of [-2, -0.5, 1]) close(m.caraOde(lam, g), m.caraCe(pi, g), 1e-6);
  assert.ok(m.caraCe(pi, -0.45) > pi);
  close(m.caraInverse(m.caraCe(0.3, -0.45), -0.45), 0.3, 1e-12);
});

test("HJB reduces to fair value at known v; a beta hedge narrows the robust band", () => {
  const n = [4, 4];
  const th = [0.3, 1.5];
  close(m.robustValue(n, th, [-1, 0], 1, 1), m.fairValue(n, th, [-1, 0]), 2e-3);
  const D = (0.3 * Math.exp(-0.3)) / (1.5 * Math.exp(-1.5));
  const width = (c: number[]) => m.robustValue(n, th, c, 0.6, 1.6) - m.robustValue(n, th, c, 0.6, 1.6, false);
  assert.ok(width([-1, D]) < 0.6 * width([-1, 0]));
});

test("NB P(N>=1) round trip and Sobolev norms", () => {
  for (const lam of [0.1, 1, 5]) close(m.nbLamFromP(m.nbP(lam)), lam, 1e-9);
  const grid = m.linspace(0, 1, 201);
  const smooth = grid.map((x) => Math.sin(2 * Math.PI * x));
  const wiggly = grid.map((x) => Math.sin(40 * Math.PI * x));
  const a = m.sobolevNorms(smooth, grid);
  const b = m.sobolevNorms(wiggly, grid);
  close(a.L2, Math.SQRT1_2, 1e-2);
  close(b.L2, Math.SQRT1_2, 1e-2);
  // Same L2 size, but H^-1 hardly sees fast wiggles and H^1 sees them strongly
  assert.ok(b.Hm1 < a.Hm1 / 10);
  assert.ok(b.H1 > a.H1 * 10);
});

test("trade row fees and suggestion", () => {
  const row = m.tradeRow(5, 0.4, 0.5, 0.02, 0.03);
  close(row.makerSellYes, 0.1 - 0.0175 * 0.25);
  close(row.takerNo, 0.49 - 0.4 - 0.07 * 0.49 * 0.51);
  assert.equal(row.suggestion, "Rest a YES offer at the mid (sell YES)");
  assert.equal(m.tradeRow(5, 0.5, 0.5, 0.02, 0.03).suggestion, "No trade");
});

test("walk-forward and gamma band", () => {
  const rows = m.walkForward([4, 6, 5, 9], ["a", "b", "c", "d"], 8);
  assert.deepEqual(rows.map((r) => r.label), ["b", "c", "d"]);
  close(rows[0].forecastMean, 4);
  const [lo, hi] = m.gammaBand(2, 0.25);
  assert.ok(lo < 2 && hi > 2);
  close(m.gammaP(4, (lo * 4) / 2), 0.1, 1e-8);
});
