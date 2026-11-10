"use client";

import { useEffect, useState } from "react";
import { SENTIMENT_API_BASE_URL } from "./api-config";
import { normalizeTicker } from "./dashboards";

// One library read per page load, shared by every caller; a failed read is retried next mount
let library: Promise<Map<string, string>> | null = null;
const EMPTY = new Map<string, string>();

/** Custom (YouTube) calls' tickers from the library, keyed by video ID; empty until loaded or if it fails. */
export function useCustomTickers() {
  const [tickers, setTickers] = useState(EMPTY);
  useEffect(() => {
    let cancelled = false;
    library ??= fetch(`${SENTIMENT_API_BASE_URL}/library`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`library ${res.status}`))))
      .then((data: { videos?: { video_identifier?: string; metadata?: { ticker?: string } }[] }) => new Map(
        (data.videos ?? []).flatMap(v => {
          const ticker = normalizeTicker(v.metadata?.ticker);
          return v.video_identifier && ticker ? [[v.video_identifier, ticker] as const] : [];
        })))
      .catch(() => { library = null; return EMPTY; });
    void library.then(map => { if (!cancelled) setTickers(map); });
    return () => { cancelled = true; };
  }, []);
  return tickers;
}
