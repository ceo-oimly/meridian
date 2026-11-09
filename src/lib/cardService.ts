import { db } from "./db";
import { DomainError } from "./ledger";
import { houseAccount, postTransaction } from "./ledgerService";
import {
  generateCardNumber,
  generateCvv,
  expiryFrom,
  defaultCardLimits,
  checkCardPurchase,
  monthStartUtc,
  MAX_CARDS_PER_USER,
} from "./cards";

/** Creates a virtual card. The full number and CVV are returned ONCE; only the last 4 digits are kept. */
export async function createCard(userId: string, accountId: string, nameOnCard: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, userId, kind: "CUSTOMER" },
    select: { id: true, currency: true, status: true },
  });
  if (!account) throw new DomainError("transferFailed");
  if (account.status !== "ACTIVE") throw new DomainError("accountRestricted");
  const count = await db.card.count({ where: { userId, status: { not: "BLOCKED" } } });
  if (count >= MAX_CARDS_PER_USER) throw new DomainError("tooManyCards");

  const number = generateCardNumber();
  const cvv = generateCvv();
  const { expMonth, expYear } = expiryFrom(new Date());
  const limits = defaultCardLimits(account.currency);
  const card = await db.card.create({
    data: {
      userId,
      accountId,
      last4: number.slice(-4),
      expMonth,
      expYear,
      nameOnCard: nameOnCard.toUpperCase().slice(0, 26),
      perTxLimitMinor: limits.perTx,
      monthlyLimitMinor: limits.monthly,
    },
    select: { id: true },
  });
  return { id: card.id, number, cvv, expMonth, expYear };
}

export async function setCardStatusByUser(userId: string, cardId: string, status: "ACTIVE" | "FROZEN") {
  const card = await db.card.findFirst({ where: { id: cardId, userId }, select: { status: true } });
  if (!card) throw new DomainError("transferFailed");
  if (card.status === "BLOCKED") throw new DomainError("cardBlockedByBank");
  await db.card.update({ where: { id: cardId }, data: { status } });
}

export async function adminSetCardStatus(cardId: string, status: "ACTIVE" | "BLOCKED", reason: string) {
  const result = await db.card.updateMany({
    where: { id: cardId },
    data: { status, statusReason: status === "ACTIVE" ? null : reason },
  });
  if (result.count !== 1) throw new DomainError("transferFailed");
}

export async function spentThisMonth(cardId: string, accountId: string, now: Date): Promise<bigint> {
  const agg = await db.ledgerEntry.aggregate({
    _sum: { amountMinor: true },
    where: {
      accountId,
      amountMinor: { lt: 0n },
      transaction: { type: "CARD_PURCHASE", reference: cardId, status: "POSTED", createdAt: { gte: monthStartUtc(now) } },
    },
  });
  const sum: bigint = agg._sum.amountMinor ?? 0n;
  return 0n - sum; // debits are negative entries
}

/** Simulated purchase at a pretend merchant. Money moves through the ledger to a house card account. */
export async function cardPurchase(args: {
  userId: string;
  cardId: string;
  merchant: string;
  amountMinor: bigint;
  idempotencyKey: string;
}) {
  const card = await db.card.findFirst({ where: { id: args.cardId, userId: args.userId }, include: { account: true } });
  if (!card) throw new DomainError("transferFailed");
  const now = new Date();
  const spent = await spentThisMonth(card.id, card.accountId, now);
  const check = checkCardPurchase({
    status: card.status,
    expMonth: card.expMonth,
    expYear: card.expYear,
    now,
    amountMinor: args.amountMinor,
    perTxLimitMinor: card.perTxLimitMinor,
    monthlyLimitMinor: card.monthlyLimitMinor,
    spentThisMonthMinor: spent,
  });
  if (check !== "ok") throw new DomainError(check);

  const house = await houseAccount("CARD", card.account.currency);
  return postTransaction({
    type: "CARD_PURCHASE",
    description: args.merchant,
    reference: card.id,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: card.accountId, currency: card.account.currency, amountMinor: -args.amountMinor },
      { accountId: house.id, currency: card.account.currency, amountMinor: args.amountMinor },
    ],
  });
}
