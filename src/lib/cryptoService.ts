import { db } from "./db";
import { DomainError } from "./ledger";
import { houseAccount, postTransaction } from "./ledgerService";
import {
  CRYPTO_ASSETS,
  parsePriceUsd,
  unitsForUsd,
  usdForUnits,
  formatUnits,
  type CryptoSymbol,
} from "./cryptoMath";

type Prices = Record<CryptoSymbol, bigint>;
let cache: { at: number; prices: Prices; live: boolean } | null = null;
const TTL_MS = 60_000;

function demoPrices(): Prices {
  const out = {} as Prices;
  for (const a of CRYPTO_ASSETS) out[a.symbol] = parsePriceUsd(a.demoPriceUsd)!;
  return out;
}

/** USD price per coin (fixed point, 1e8). Live from CoinGecko when reachable, otherwise demo prices. */
export async function getCryptoPrices(): Promise<{ prices: Prices; live: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const ids = CRYPTO_ASSETS.map((a) => a.coingeckoId).join(",");
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const prices = demoPrices();
    let found = 0;
    for (const a of CRYPTO_ASSETS) {
      const p = parsePriceUsd(json[a.coingeckoId]?.usd ?? NaN);
      if (p) {
        prices[a.symbol] = p;
        found++;
      }
    }
    cache = { at: Date.now(), prices, live: found === CRYPTO_ASSETS.length };
  } catch (e) {
    console.warn("[crypto] using demo prices:", e instanceof Error ? e.message : e);
    cache = { at: Date.now() - TTL_MS + 30_000, prices: demoPrices(), live: false };
  }
  return cache;
}

export async function getHoldings(userId: string) {
  const rows = await db.cryptoHolding.findMany({ where: { userId, quantity: { gt: 0n } } });
  return rows.map((r) => ({ asset: r.asset as CryptoSymbol, quantity: r.quantity }));
}

async function usdWallet(userId: string) {
  const w = await db.account.findFirst({ where: { userId, currency: "USD", kind: "CUSTOMER" }, select: { id: true } });
  if (!w) throw new DomainError("needUsdWallet");
  return w;
}

/** Paper trading: the USD moves through the ledger, the coins are only a counter. No real crypto exists. */
export async function buyCrypto(args: { userId: string; symbol: CryptoSymbol; usdMinor: bigint; idempotencyKey: string }) {
  const wallet = await usdWallet(args.userId);
  const { prices } = await getCryptoPrices();
  const price = prices[args.symbol];
  const units = unitsForUsd(args.usdMinor, price);
  if (units <= 0n) throw new DomainError("amountTooSmall");
  const house = await houseAccount("CRYPTO", "USD");

  return postTransaction({
    type: "CRYPTO_TRADE",
    description: `Buy ${formatUnits(units)} ${args.symbol}`,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: wallet.id, currency: "USD", amountMinor: -args.usdMinor },
      { accountId: house.id, currency: "USD", amountMinor: args.usdMinor },
    ],
    after: async (tx) => {
      await tx.cryptoHolding.upsert({
        where: { userId_asset: { userId: args.userId, asset: args.symbol } },
        update: { quantity: { increment: units } },
        create: { userId: args.userId, asset: args.symbol, quantity: units },
      });
    },
  });
}

export async function sellCrypto(args: { userId: string; symbol: CryptoSymbol; units: bigint; idempotencyKey: string }) {
  const wallet = await usdWallet(args.userId);
  const { prices } = await getCryptoPrices();
  const usd = usdForUnits(args.units, prices[args.symbol]);
  if (usd <= 0n) throw new DomainError("amountTooSmall");
  const house = await houseAccount("CRYPTO", "USD");

  return postTransaction({
    type: "CRYPTO_TRADE",
    description: `Sell ${formatUnits(args.units)} ${args.symbol}`,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: house.id, currency: "USD", amountMinor: -usd },
      { accountId: wallet.id, currency: "USD", amountMinor: usd },
    ],
    after: async (tx) => {
      const changed = await tx.cryptoHolding.updateMany({
        where: { userId: args.userId, asset: args.symbol, quantity: { gte: args.units } },
        data: { quantity: { decrement: args.units } },
      });
      if (changed.count !== 1) throw new DomainError("insufficientHoldings");
    },
  });
}
