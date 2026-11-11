// OpenJev-style LLM ladder: one probability per "said at least k times" strike, made monotone.
// Shared by the API route (server) and its tests. The model never sees market prices.

import { monotoneDecreasing } from "./math.ts";

export const LLM_SYSTEM =
  "You forecast Kalshi earnings-call mention markets. A market on strike k settles YES if company management " +
  "(prepared remarks and answers; analysts' questions and the operator do not count) says the word or phrase at " +
  "least k times on the call. Plurals and possessives count. Give a calibrated probability for every strike: they " +
  "must not increase as k increases. Base rates from earlier calls are your anchor; move away from them only for a " +
  "concrete reason (a topic in the news or in the provided context that management is likely to discuss more or less). " +
  'Reply with one JSON object: {"probabilities": {"<k>": <0..1>, ...}, "expected_count": <number>, "rationale": "<two sentences>"}';

export interface LadderRequest {
  company: string;
  word: string;
  strikes: number[];
  history: { label: string; count: number }[];
  context?: string;
}

export function buildPrompt(req: LadderRequest): string {
  const lines = [
    `Company: ${req.company}`,
    `Word or phrase: ${req.word}`,
    `Strikes: ${req.strikes.join(", ")}`,
    "",
    "Counts on earlier calls (oldest first):",
    ...req.history.map((h) => `- ${h.label}: ${h.count}`),
  ];
  if (req.context?.trim()) lines.push("", "Context for the upcoming call (press release, news):", req.context.trim());
  lines.push("", "Forecast the count on the next call.");
  return lines.join("\n");
}

/** Validate a request body; returns an error message or null. */
export function validate(body: unknown): string | null {
  const b = body as Partial<LadderRequest>;
  if (!b || typeof b !== "object") return "Body must be a JSON object";
  if (typeof b.word !== "string" || !b.word.trim() || b.word.length > 120) return "word: 1–120 characters";
  if (typeof b.company !== "string" || b.company.length > 80) return "company: up to 80 characters";
  if (!Array.isArray(b.strikes) || !b.strikes.length || b.strikes.length > 12 || !b.strikes.every((k) => Number.isInteger(k) && k >= 1 && k <= 500))
    return "strikes: 1–12 whole numbers from 1 to 500";
  if (!Array.isArray(b.history) || b.history.length > 40 || !b.history.every((h) => h && typeof h.label === "string" && h.label.length <= 80 && Number.isInteger(h.count) && h.count >= 0 && h.count <= 5000))
    return "history: up to 40 {label, count} entries";
  if (b.context !== undefined && (typeof b.context !== "string" || b.context.length > 6000)) return "context: up to 6000 characters";
  return null;
}

/** Parse the model's JSON reply into a monotone ladder aligned with `strikes`. */
export function parseLadder(raw: string, strikes: number[]): { raw: number[]; ladder: number[]; expectedCount: number | null; rationale: string } {
  let text = raw.trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("The LLM did not return JSON");
    obj = JSON.parse(text.slice(s, e + 1));
  }
  const probs = (obj.probabilities ?? {}) as Record<string, unknown>;
  const values = strikes.map((k) => {
    const v = Number(probs[String(k)]);
    if (!Number.isFinite(v)) throw new Error(`The LLM gave no probability for strike ${k}`);
    const p = v > 1 ? v / 100 : v;
    return Math.min(0.995, Math.max(0.005, p));
  });
  const expected = Number(obj.expected_count);
  return {
    raw: values,
    ladder: monotoneDecreasing(values),
    expectedCount: Number.isFinite(expected) ? expected : null,
    rationale: String(obj.rationale ?? "").slice(0, 1000),
  };
}
