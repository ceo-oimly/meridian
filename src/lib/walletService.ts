import { db } from "./db";
import { DomainError } from "./ledger";
import { houseAccount, postTransaction } from "./ledgerService";
import { convert, trimRate, type CurrencyCode } from "./money";
import { customerRate } from "./fxRates";
import { getUsdRates } from "./rates";
import { generateAccountNumber } from "./accountNumber";
import { dormantCutoff } from "./dormancy";

export const AUTO_DORMANT_REASON = "Inactive for 180+ days (automatic)";

/** Open another currency wallet for a customer. One wallet per currency. */
export async function openWallet(userId: string, currency: CurrencyCode) {
  const existing = await db.account.findFirst({ where: { userId, currency, kind: "CUSTOMER" }, select: { id: true } });
  if (existing) throw new DomainError("walletExists");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.account.create({
        data: { userId, currency, kind: "CUSTOMER", accountNumber: generateAccountNumber() },
        select: { id: true },
      });
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new DomainError("transferFailed");
}

export async function quoteConversion(from: CurrencyCode, to: CurrencyCode, amountMinor: bigint) {
  const { rates, live } = await getUsdRates();
  const rate = customerRate(rates, from, to);
  return { rate, live, receiveMinor: convert(amountMinor, from, to, rate) };
}

/** Convert between two of the customer's own wallets. The bank's spread is built into the rate. */
export async function convertCurrency(args: {
  userId: string;
  fromAccountId: string;
  toCurrency: CurrencyCode;
  amountMinor: bigint;
  idempotencyKey: string;
}) {
  const from = await db.account.findFirst({
    where: { id: args.fromAccountId, userId: args.userId, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!from) throw new DomainError("transferFailed");
  if (from.currency === args.toCurrency) throw new DomainError("sameCurrency");
  const to = await db.account.findFirst({
    where: { userId: args.userId, currency: args.toCurrency, kind: "CUSTOMER" },
    select: { id: true },
  });
  if (!to) throw new DomainError("needTargetWallet");

  const q = await quoteConversion(from.currency, args.toCurrency, args.amountMinor);
  if (q.receiveMinor <= 0n) throw new DomainError("amountTooSmall");

  const [houseFrom, houseTo] = await Promise.all([
    houseAccount("FX", from.currency),
    houseAccount("FX", args.toCurrency),
  ]);
  return postTransaction({
    type: "FX_CONVERSION",
    description: `${from.currency}→${args.toCurrency} @ ${trimRate(q.rate)}`,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: from.id, currency: from.currency, amountMinor: -args.amountMinor },
      { accountId: houseFrom.id, currency: from.currency, amountMinor: args.amountMinor },
      { accountId: houseTo.id, currency: args.toCurrency, amountMinor: -q.receiveMinor },
      { accountId: to.id, currency: args.toCurrency, amountMinor: q.receiveMinor },
    ],
  });
}

/** Mark customer wallets with no activity for 180 days as dormant. Returns how many changed. */
export async function markDormantAccounts(now: Date = new Date()): Promise<number> {
  const result = await db.account.updateMany({
    where: {
      kind: "CUSTOMER",
      status: "ACTIVE",
      lastActivityAt: { lt: dormantCutoff(now) },
      user: { role: "USER" },
    },
    data: { status: "DORMANT", statusReason: AUTO_DORMANT_REASON },
  });
  if (result.count > 0) {
    await db.auditLog.create({ data: { actorId: null, action: "system.dormancy", metadata: { count: result.count } } });
  }
  return result.count;
}

/** Signing in again reactivates wallets that went dormant automatically (not ones an admin set). */
export async function reactivateAutoDormant(userId: string): Promise<void> {
  await db.account.updateMany({
    where: { userId, status: "DORMANT", statusReason: AUTO_DORMANT_REASON },
    data: { status: "ACTIVE", statusReason: null, lastActivityAt: new Date() },
  });
}

/** Ledger rows for one wallet, oldest first, for the CSV statement. */
export async function statementRows(userId: string, accountId: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, userId, kind: "CUSTOMER" },
    select: { id: true, currency: true, accountNumber: true },
  });
  if (!account) return null;
  const entries = await db.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    take: 5000,
    include: { transaction: { select: { type: true, description: true, id: true } } },
  });
  return { account, entries };
}
