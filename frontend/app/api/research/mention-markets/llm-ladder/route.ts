// LLM ladder for the Forecaster, via the Gemini API. The key stays on the server.
import { LLM_SYSTEM, buildPrompt, parseLadder, validate, type LadderRequest } from "@/lib/mention-lab/llm";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

// Every answer is cached for the life of the server, so a repeated question costs nothing
const cache = new Map<string, unknown>();
const CACHE_SIZE = 256;

export async function GET() {
  return Response.json({ available: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ status: "unavailable", reason: "Set GEMINI_API_KEY in .env.local and restart the dev server." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "error", reason: "Body must be JSON" }, { status: 400 });
  }
  const problem = validate(body);
  if (problem) return Response.json({ status: "error", reason: problem }, { status: 400 });
  const req = body as LadderRequest;

  const prompt = buildPrompt(req);
  const cacheKey = JSON.stringify([MODEL, prompt]);
  if (cache.has(cacheKey)) return Response.json({ ...(cache.get(cacheKey) as object), cached: true });

  const call = () =>
    fetch(ENDPOINT(MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LLM_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  let res: Response;
  try {
    res = await call();
    // "Model is experiencing high demand" (503) usually clears within seconds: retry once
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 3000));
      res = await call();
    }
  } catch (e) {
    return Response.json({ status: "error", reason: `Could not reach Gemini: ${(e as Error).message}` }, { status: 502 });
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.error?.message ?? `HTTP ${res.status}`;
    const reason = res.status === 429 ? `Gemini rate limit: ${msg}` : `Gemini error: ${msg}`;
    return Response.json({ status: "error", reason: reason.slice(0, 400) }, { status: 502 });
  }

  const text: string = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    const parsed = parseLadder(text, req.strikes);
    const result = { status: "ok", model: MODEL, ...parsed, cached: false };
    cache.set(cacheKey, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    return Response.json(result);
  } catch (e) {
    return Response.json({ status: "error", reason: (e as Error).message }, { status: 502 });
  }
}
