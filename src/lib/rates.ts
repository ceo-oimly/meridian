import { cleanRates, FALLBACK_USD_RATES } from "./fxRates";
import type { CurrencyCode } from "./money";

interface Cached {
  at: number;
  rates: Record<CurrencyCode, string>;
  live: boolean;
}
let cache: Cached | null = null;
const TTL_MS = 10 * 60 * 1000;

/** Units of each currency per 1 USD. Live from a free public service, or approximate fallback values. */
export async function getUsdRates(): Promise<{ rates: Record<CurrencyCode, string>; live: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, unknown> };
    if (!json.rates) throw new Error("no rates");
    cache = { at: Date.now(), rates: cleanRates(json.rates), live: true };
  } catch (e) {
    console.warn("[rates] using fallback rates:", e instanceof Error ? e.message : e);
    cache = { at: Date.now() - TTL_MS + 60_000, rates: { ...FALLBACK_USD_RATES }, live: false }; // retry in 1 minute
  }
  return cache;
}
