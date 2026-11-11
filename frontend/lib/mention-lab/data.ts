// Typed access to the JSON built by research/build_data.py and research/export_simpliearn_counts.py.
import examplesJson from "@/data/mention-lab/examples.json";
import findingsJson from "@/data/mention-lab/findings.json";
import pdeJson from "@/data/mention-lab/mentionpde.json";

export interface Stat {
  contracts: number;
  events: number;
  mean: number;
  t: number;
}

export interface Findings {
  source: string;
  lambda: {
    rows: number;
    calls_from: string;
    calls_to: string;
    brier_k1: { poisson: number; nb_model: number };
    brier_k3: { poisson: number; nb_model: number };
    brier_k10: { poisson: number; nb_model: number };
    k1: { bucket: string; n: number; poisson: number; nb_model: number; realized: number }[];
    k3: { bucket: string; n: number; poisson: number; nb_model: number; realized: number }[];
    k10: { bucket: string; n: number; poisson: number; nb_model: number; realized: number }[];
  };
  kalshi: {
    markets: number;
    events: number;
    companies: number;
    first_call: string;
    last_call: string;
    yes_rate: number;
    median_spread: number;
    excluded_uncertain_call_date: number;
    calibration: { bucket: string; n: number; price: number; realized: number; buy_yes_pnl: number; buy_no_pnl: number }[];
    taker_rules: Record<string, Stat>;
    maker: Record<string, Stat>;
    maker_by_month: { month: string; contracts: number; pnl: number }[];
    maker_by_model_quintile: { quintile: number; mean_edge: number; contracts: number; events: number; mean: number; t: number }[];
    maker_model_filtered: Record<string, Stat>;
  };
  llm: {
    markets: number;
    events: number;
    first_call: string;
    "market mid": { brier: number; logloss: number };
    LLM: { brier: number; logloss: number };
    "model: base rates": { brier: number; logloss: number };
    stacking: { weight_market: number; t_market: number; weight_llm: number; t_llm: number };
    taker_on_llm_edge_5c: Stat;
  };
  llm_backend: string;
}

export interface SeasonCurve {
  season: string;
  markets: number;
  events: number;
  mean_premium: number;
  curve: number[];
  h1_norm: number;
  dist_l2: number;
  dist_hm1: number;
}

export interface MentionPde {
  markets: number;
  events: number;
  maker_short_yes: { mean: number; t: number };
  within_event_rho: number;
  cara: {
    gamma: number;
    se: number;
    loglik_grid: number[];
    loglik: number[];
    by_season: { season: string; gamma: number; se: number; markets: number }[];
    calibration: { price: number; realized: number; n: number }[];
  };
  rellich: {
    grid: number[];
    seasons: SeasonCurve[];
    limit: number[];
    beta: number[];
    premium_per_beta: number[];
    observed: { L2: number; Hm1: number };
    null: { L2: number[]; Hm1: number[] };
    p: { L2: number; Hm1: number };
    n_boot: number;
  };
  hedge_reported: { unhedged_c: number; beta_neutral_c: number; premium_trend_c_per_season: number; premium_trend_t: number };
}

export interface Example {
  company: string;
  ticker: string;
  word: string;
  calls: string[];
  counts: number[];
}

export const findings = findingsJson as unknown as Findings;
export const pde = pdeJson as unknown as MentionPde;
export const examples = examplesJson as Example[];

/** Value of a curve on the premium grid at price u (linear interpolation). */
export function atPrice(curve: number[], u: number, grid = pde.rellich.grid): number {
  if (u <= grid[0]) return curve[0];
  if (u >= grid[grid.length - 1]) return curve[curve.length - 1];
  const i = grid.findIndex((g) => g >= u);
  const w = (u - grid[i - 1]) / (grid[i] - grid[i - 1]);
  return curve[i - 1] * (1 - w) + curve[i] * w;
}
