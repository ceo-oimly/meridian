// Paper-trading crypto maths in integers. Quantities are stored in units of 1e-8 coin.
// Prices are USD per coin scaled by 1e8. All fiat amounts are USD cents.

export const CRYPTO_ASSETS = [
  { symbol: "BTC", name: "Bitcoin", coingeckoId: "bitcoin", demoPriceUsd: 65_000 },
  { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", demoPriceUsd: 3_200 },
  { symbol: "SOL", name: "Solana", coingeckoId: "solana", demoPriceUsd: 150 },
  { symbol: "XRP", name: "XRP", coingeckoId: "ripple", demoPriceUsd: 0.55 },
] as const;

export type CryptoSymbol = (typeof CRYPTO_ASSETS)[number]["symbol"];

export function isCryptoSymbol(value: string): value is CryptoSymbol {
  return CRYPTO_ASSETS.some((a) => a.symbol === value);
}

const UNIT_DECIMALS = 8;

/** USD price (number from an API) -> fixed point at 1e8. Returns null for bad prices. */
export function parsePriceUsd(price: number): bigint | null {
  if (!Number.isFinite(price) || price <= 0 || price >= 1e12) return null;
  const scaled = BigInt(price.toFixed(UNIT_DECIMALS).replace(".", ""));
  return scaled > 0n ? scaled : null;
}

/** How many 1e-8 units a USD-cents amount buys (rounded down). */
export function unitsForUsd(usdMinor: bigint, priceScaled: bigint): bigint {
  return (usdMinor * 10n ** 14n) / priceScaled;
}

/** USD cents received for selling units (rounded down). */
export function usdForUnits(units: bigint, priceScaled: bigint): bigint {
  return (units * priceScaled) / 10n ** 14n;
}

/** "0.002" -> 200000n. At most 8 decimals, must be positive. */
export function parseUnits(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > UNIT_DECIMALS) return null;
  const value = BigInt(whole + frac.padEnd(UNIT_DECIMALS, "0"));
  return value > 0n ? value : null;
}

/** 200000n -> "0.002"; trailing zeros trimmed. */
export function formatUnits(units: bigint): string {
  const digits = units.toString().padStart(UNIT_DECIMALS + 1, "0");
  const whole = digits.slice(0, -UNIT_DECIMALS);
  const frac = digits.slice(-UNIT_DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
