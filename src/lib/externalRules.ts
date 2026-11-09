// Simulated transfers to outside banks. Bank names are fictional.
import { CURRENCY_EXPONENT, type CurrencyCode } from "./money.ts";

export const EXTERNAL_BANKS = [
  "Harbor National Bank",
  "Pacific Trust Bank",
  "Maple Federal Credit Union",
  "Han River Bank",
  "Seoul Commerce Bank",
  "Jeju Savings Bank",
  "Thames & Crown Bank",
  "Lagos Unity Bank",
] as const;

export function isKnownBank(name: string): boolean {
  return (EXTERNAL_BANKS as readonly string[]).includes(name);
}

export function isValidExternalAccount(value: string): boolean {
  return /^\d{8,16}$/.test(value);
}

/** Fee: 0.5% rounded up, never less than one major unit (for example $1 or 1 won). */
export function externalFee(amountMinor: bigint, currency: CurrencyCode): bigint {
  const percent = (amountMinor * 50n + 9_999n) / 10_000n;
  const minimum = 10n ** BigInt(CURRENCY_EXPONENT[currency]);
  return percent > minimum ? percent : minimum;
}
