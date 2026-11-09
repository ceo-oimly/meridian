import { CURRENCIES, CURRENCY_EXPONENT, type CurrencyCode } from "./money.ts";

// Limits are written in MAJOR units (dollars, won...) and converted to minor units once,
// so each currency gets a sensible size (₩5,000,000 and $5,000 are about the same).
type MajorTable = Record<CurrencyCode, number>;

function toMinor(major: MajorTable): Record<CurrencyCode, bigint> {
  const out = {} as Record<CurrencyCode, bigint>;
  for (const c of CURRENCIES) out[c] = BigInt(major[c]) * 10n ** BigInt(CURRENCY_EXPONENT[c]);
  return out;
}

export const TRANSFER_MAX_MINOR = toMinor({
  USD: 5_000, EUR: 4_500, GBP: 4_000, JPY: 700_000, KRW: 5_000_000, NGN: 7_500_000, CAD: 6_500, AUD: 7_500,
});

// Admin adjustments are bigger than customer limits but still capped to catch typos.
export const ADMIN_ADJUST_MAX_MINOR = toMinor({
  USD: 1_000_000, EUR: 900_000, GBP: 800_000, JPY: 150_000_000, KRW: 1_000_000_000,
  NGN: 1_500_000_000, CAD: 1_300_000, AUD: 1_500_000,
});

// Default monthly card spending limit.
export const CARD_MONTHLY_MAX_MINOR = toMinor({
  USD: 2_000, EUR: 1_800, GBP: 1_600, JPY: 300_000, KRW: 2_000_000, NGN: 3_000_000, CAD: 2_600, AUD: 3_000,
});

// Largest loan a customer may request.
export const LOAN_MAX_MINOR = toMinor({
  USD: 10_000, EUR: 9_000, GBP: 8_000, JPY: 1_500_000, KRW: 10_000_000, NGN: 15_000_000, CAD: 13_000, AUD: 15_000,
});

// Largest single crypto trade, in USD cents.
export const CRYPTO_TRADE_MAX_USD_MINOR = 1_000_000n; // $10,000.00

export type LimitCheck = "ok" | "notPositive" | "overLimit";

export function checkAmount(
  amountMinor: bigint,
  currency: CurrencyCode,
  limits: Record<CurrencyCode, bigint>,
): LimitCheck {
  if (amountMinor <= 0n) return "notPositive";
  if (amountMinor > limits[currency]) return "overLimit";
  return "ok";
}
