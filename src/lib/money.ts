// Money helpers. Amounts are BigInt minor units (USD cents, KRW won). Never floats.

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "KRW", "NGN", "CAD", "AUD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}

// Number of decimal places in the minor unit. USD = 2 (cents), KRW and JPY = 0 (no subunit).
export const CURRENCY_EXPONENT: Record<CurrencyCode, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
  NGN: 2,
  CAD: 2,
  AUD: 2,
};

export class MoneyError extends Error {}

function exponentOf(currency: CurrencyCode): number {
  const exp = CURRENCY_EXPONENT[currency];
  if (exp === undefined) throw new MoneyError(`Unsupported currency: ${currency}`);
  return exp;
}

/**
 * Parse a user-entered decimal string ("1250.50", "1,250.5", "50000") into minor units.
 * Rejects more decimals than the currency allows instead of silently rounding.
 */
export function parseAmount(input: string, currency: CurrencyCode): bigint {
  const exp = exponentOf(currency);
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new MoneyError(`Invalid amount: "${input}"`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > exp) {
    throw new MoneyError(`${currency} allows at most ${exp} decimal places`);
  }
  const padded = frac.padEnd(exp, "0");
  return BigInt(whole + padded);
}

/** Minor units -> plain decimal string, e.g. 125050n USD -> "1250.50". */
export function toDecimalString(minor: bigint, currency: CurrencyCode): string {
  const exp = exponentOf(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const digits = abs.toString().padStart(exp + 1, "0");
  const whole = digits.slice(0, digits.length - exp);
  const frac = exp === 0 ? "" : "." + digits.slice(digits.length - exp);
  return (negative ? "-" : "") + whole + frac;
}

/** Locale-aware display, e.g. ("en-US") $1,250.50 or ("ko-KR") ₩50,000. */
export function formatMoney(minor: bigint, currency: CurrencyCode, locale: string): string {
  const exp = exponentOf(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(toDecimalString(minor, currency) as unknown as number);
}

const RATE_SCALE_DIGITS = 8;
const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS);

/** Parse an FX rate string ("1380.25") into a fixed-point BigInt at 1e8 scale. */
export function parseRate(rate: string): bigint {
  const cleaned = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new MoneyError(`Invalid rate: "${rate}"`);
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > RATE_SCALE_DIGITS) {
    throw new MoneyError(`Rate allows at most ${RATE_SCALE_DIGITS} decimal places`);
  }
  const value = BigInt(whole + frac.padEnd(RATE_SCALE_DIGITS, "0"));
  if (value === 0n) throw new MoneyError("Rate must be greater than zero");
  return value;
}

/**
 * Convert minor units between currencies. `rate` is how many MAJOR units of `to`
 * one MAJOR unit of `from` buys (e.g. USD->KRW 1380.25). Rounds half up; amount must be >= 0.
 */
export function convert(
  minor: bigint,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: string,
): bigint {
  if (minor < 0n) throw new MoneyError("Cannot convert a negative amount");
  const fromExp = exponentOf(from);
  const toExp = exponentOf(to);
  const r = parseRate(rate);
  // result_minor = minor * rate * 10^toExp / 10^fromExp
  const numerator = minor * r * 10n ** BigInt(toExp);
  const denominator = RATE_SCALE * 10n ** BigInt(fromExp);
  return (numerator * 2n + denominator) / (denominator * 2n); // round half up
}

/** Fixed-point rate (1e8 scale) back to a decimal string, e.g. 138025000000n -> "1380.25000000". */
export function scaledRateToString(value: bigint): string {
  const digits = value.toString().padStart(RATE_SCALE_DIGITS + 1, "0");
  return `${digits.slice(0, -RATE_SCALE_DIGITS)}.${digits.slice(-RATE_SCALE_DIGITS)}`;
}

/** Reduce a rate by a margin in basis points (50 bps = 0.5%). This is the bank's FX spread. */
export function applySpread(rate: string, spreadBps: number): string {
  if (!Number.isInteger(spreadBps) || spreadBps < 0 || spreadBps >= 10_000) {
    throw new MoneyError("Invalid spread");
  }
  const adjusted = (parseRate(rate) * BigInt(10_000 - spreadBps)) / 10_000n;
  if (adjusted === 0n) throw new MoneyError("Rate too small");
  return scaledRateToString(adjusted);
}

/** "1380.25000000" -> "1380.25" for display. */
export function trimRate(rate: string): string {
  return rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") : rate;
}
