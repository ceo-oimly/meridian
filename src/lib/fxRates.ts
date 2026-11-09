// Currency conversion maths. Rates are "units of currency per 1 USD".
import { CURRENCIES, parseRate, scaledRateToString, applySpread, type CurrencyCode } from "./money.ts";

export const FX_SPREAD_BPS = 50; // the bank's margin: 0.50%

/** Used only when the live rate service cannot be reached. Approximate. */
export const FALLBACK_USD_RATES: Record<CurrencyCode, string> = {
  USD: "1",
  EUR: "0.92",
  GBP: "0.79",
  JPY: "150",
  KRW: "1380",
  NGN: "1500",
  CAD: "1.36",
  AUD: "1.52",
};

/** Keep only usable positive rates for supported currencies; fill gaps from the fallback table. */
export function cleanRates(raw: Record<string, unknown> | null | undefined): Record<CurrencyCode, string> {
  const out = { ...FALLBACK_USD_RATES };
  if (!raw) return out;
  for (const c of CURRENCIES) {
    const v = raw[c];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e9) {
      out[c] = v.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    }
  }
  out.USD = "1";
  return out;
}

/** Mid-market rate from one currency to another, as a decimal string. */
export function midRate(rates: Record<CurrencyCode, string>, from: CurrencyCode, to: CurrencyCode): string {
  const scale = 10n ** 8n;
  const cross = (parseRate(rates[to]) * scale) / parseRate(rates[from]);
  return scaledRateToString(cross);
}

/** The customer's rate: mid-market minus the bank's spread. */
export function customerRate(rates: Record<CurrencyCode, string>, from: CurrencyCode, to: CurrencyCode): string {
  return applySpread(midRate(rates, from, to), FX_SPREAD_BPS);
}
