// Virtual card rules. Card numbers here are FICTIONAL: they start with 9 (not used by any real
// card network) and only the last 4 digits are ever stored.
import { randomInt } from "node:crypto";
import { CARD_MONTHLY_MAX_MINOR } from "./limits.ts";
import type { CurrencyCode } from "./money.ts";

export type CardStatusValue = "ACTIVE" | "FROZEN" | "BLOCKED";

export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function luhnValid(number: string): boolean {
  return /^\d{12,19}$/.test(number) && luhnCheckDigit(number.slice(0, -1)) === Number(number.slice(-1));
}

export function generateCardNumber(): string {
  let body = "9";
  for (let i = 0; i < 14; i++) body += String(randomInt(0, 10));
  return body + String(luhnCheckDigit(body));
}

export function expiryFrom(now: Date, years = 4): { expMonth: number; expYear: number } {
  return { expMonth: now.getUTCMonth() + 1, expYear: now.getUTCFullYear() + years };
}

/** A card is valid through the end of its expiry month. */
export function isCardExpired(expMonth: number, expYear: number, now: Date): boolean {
  const year = now.getUTCFullYear();
  return year > expYear || (year === expYear && now.getUTCMonth() + 1 > expMonth);
}

/** Default limits: monthly from limits.ts, a single purchase may use up to a quarter of it. */
export function defaultCardLimits(currency: CurrencyCode): { perTx: bigint; monthly: bigint } {
  const monthly = CARD_MONTHLY_MAX_MINOR[currency];
  return { perTx: monthly / 4n, monthly };
}

export const MAX_CARDS_PER_USER = 3;

export type PurchaseCheck =
  | "ok"
  | "cardBlocked"
  | "cardFrozen"
  | "cardExpired"
  | "amountInvalid"
  | "overTxLimit"
  | "overMonthlyLimit";

export function checkCardPurchase(a: {
  status: CardStatusValue;
  expMonth: number;
  expYear: number;
  now: Date;
  amountMinor: bigint;
  perTxLimitMinor: bigint;
  monthlyLimitMinor: bigint;
  spentThisMonthMinor: bigint;
}): PurchaseCheck {
  if (a.status === "BLOCKED") return "cardBlocked";
  if (a.status === "FROZEN") return "cardFrozen";
  if (isCardExpired(a.expMonth, a.expYear, a.now)) return "cardExpired";
  if (a.amountMinor <= 0n) return "amountInvalid";
  if (a.amountMinor > a.perTxLimitMinor) return "overTxLimit";
  if (a.spentThisMonthMinor + a.amountMinor > a.monthlyLimitMinor) return "overMonthlyLimit";
  return "ok";
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Random 3-digit security code, shown once at creation and never stored. */
export function generateCvv(): string {
  return String(randomInt(0, 1000)).padStart(3, "0");
}

export function formatCardNumber(n: string): string {
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}
