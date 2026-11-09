// Database layer for the ledger. The rules live in ledger.ts; this file applies them atomically.
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  assertBalanced,
  assertStatusAllows,
  assertSufficientFunds,
  transferPostings,
  LedgerError,
  type AccountStatus,
  type Posting,
} from "./ledger";
import type { CurrencyCode } from "./money";

export type TxType =
  | "TRANSFER"
  | "ADMIN_ADJUSTMENT"
  | "FX_CONVERSION"
  | "CARD_PURCHASE"
  | "LOAN_DISBURSEMENT"
  | "LOAN_REPAYMENT"
  | "EXTERNAL_TRANSFER"
  | "CRYPTO_TRADE"
  | "REVERSAL";

export type DbTx = Prisma.TransactionClient;

interface PostInput {
  type: TxType;
  description?: string | null;
  idempotencyKey: string;
  postings: Posting[];
  /** Id of the card / loan / request this belongs to (shown in statements, used for limits). */
  reference?: string | null;
  /** Runs inside the SAME database transaction, so related rows change atomically with the money. */
  after?: (tx: DbTx, transactionId: string) => Promise<void>;
}

/**
 * Post a balanced set of entries in ONE database transaction.
 * - Retrying with the same idempotencyKey returns the original transaction instead of posting twice.
 * - Debits use a guarded UPDATE (balance >= amount, status ACTIVE), so two concurrent spends
 *   can never overdraw an account even if both passed the earlier checks.
 */
export async function postTransaction(input: PostInput): Promise<{ id: string; replayed: boolean }> {
  assertBalanced(input.postings);

  try {
    const id = await db.$transaction(async (tx) => {
      const txn = await tx.ledgerTransaction.create({
        data: {
          type: input.type,
          description: input.description ?? null,
          idempotencyKey: input.idempotencyKey,
          reference: input.reference ?? null,
          status: "POSTED",
        },
      });

      // Stable order so two transfers touching the same accounts can't deadlock.
      const ordered = [...input.postings].sort((a, b) => a.accountId.localeCompare(b.accountId));

      for (const p of ordered) {
        const account = await tx.account.findUnique({
          where: { id: p.accountId },
          select: { kind: true, status: true, currency: true, balanceMinor: true },
        });
        if (!account) throw new LedgerError(`Unknown account ${p.accountId}`);
        if (account.currency !== p.currency) throw new LedgerError("Currency mismatch");

        assertStatusAllows(account.status as AccountStatus, p);
        const isSystem = account.kind === "SYSTEM";
        assertSufficientFunds(account.balanceMinor, p, isSystem);

        const now = new Date();
        const result =
          p.amountMinor < 0n
            ? await tx.account.updateMany({
                where: {
                  id: p.accountId,
                  status: "ACTIVE",
                  ...(isSystem ? {} : { balanceMinor: { gte: -p.amountMinor } }),
                },
                data: { balanceMinor: { increment: p.amountMinor }, lastActivityAt: now },
              })
            : await tx.account.updateMany({
                where: { id: p.accountId, status: { in: ["ACTIVE", "DORMANT"] } },
                data: { balanceMinor: { increment: p.amountMinor }, lastActivityAt: now },
              });

        if (result.count !== 1) throw new LedgerError("Insufficient funds or account not active");

        await tx.ledgerEntry.create({
          data: {
            transactionId: txn.id,
            accountId: p.accountId,
            currency: p.currency,
            amountMinor: p.amountMinor,
          },
        });
      }
      if (input.after) await input.after(tx, txn.id);
      return txn.id;
    });
    return { id, replayed: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, replayed: true };
    }
    throw e;
  }
}

export type HouseKind = "ADJUST" | "FX" | "CARD" | "LOAN" | "EXTERNAL" | "CRYPTO";

/** House account for one purpose and currency. System accounts are allowed to go negative. */
export async function houseAccount(kind: HouseKind, currency: CurrencyCode) {
  const accountNumber = `SYS-${kind}-${currency}`;
  return db.account.upsert({
    where: { accountNumber },
    update: {},
    create: { kind: "SYSTEM", currency, accountNumber, userId: null },
    select: { id: true },
  });
}

const adjustmentAccount = (currency: CurrencyCode) => houseAccount("ADJUST", currency);

/**
 * Credit or debit a customer wallet on behalf of an administrator.
 * Posted as a normal balanced ledger transaction against the house adjustment account,
 * with the reason stored on the transaction, so it shows up on the customer's history.
 */
export async function adminAdjust(args: {
  accountId: string;
  direction: "credit" | "debit";
  amountMinor: bigint;
  reason: string;
  idempotencyKey: string;
}) {
  const account = await db.account.findFirst({
    where: { id: args.accountId, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!account) throw new LedgerError("Unknown account");

  const house = await adjustmentAccount(account.currency);
  const currency = account.currency;
  const amount = args.amountMinor;

  return postTransaction({
    type: "ADMIN_ADJUSTMENT",
    description: args.reason,
    idempotencyKey: args.idempotencyKey,
    postings:
      args.direction === "credit"
        ? [
            { accountId: house.id, currency, amountMinor: -amount },
            { accountId: account.id, currency, amountMinor: amount },
          ]
        : [
            { accountId: account.id, currency, amountMinor: -amount },
            { accountId: house.id, currency, amountMinor: amount },
          ],
  });
}

/** Customers (with their wallets) matching a name, email or account number. Empty query = newest. */
export async function searchCustomers(query: string) {
  const term = query.trim().slice(0, 100);
  return db.user.findMany({
    where: term
      ? {
          OR: [
            { email: { contains: term, mode: "insensitive" } },
            { fullName: { contains: term, mode: "insensitive" } },
            { accounts: { some: { accountNumber: { contains: term } } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { accounts: { where: { kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } } },
  });
}

/** Latest admin actions from the audit log, with the acting admin's email. */
export async function recentAdminActivity(limit = 15) {
  const logs = await db.auditLog.findMany({
    where: { action: { startsWith: "admin." } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id))];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  const emailById = new Map(actors.map((a) => [a.id, a.email]));
  return logs.map((l) => ({ ...l, actorEmail: l.actorId ? (emailById.get(l.actorId) ?? null) : null }));
}

export type TransferFailure = "recipientNotFound" | "currencyMismatch" | "sameAccount";

export async function transfer(args: {
  userId: string;
  fromAccountId: string;
  toAccountNumber: string;
  amountMinor: bigint;
  memo?: string | null;
  idempotencyKey: string;
}): Promise<{ id: string; replayed: boolean } | { failure: TransferFailure }> {
  const from = await db.account.findFirst({
    where: { id: args.fromAccountId, userId: args.userId, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!from) throw new LedgerError("Unknown account");

  const to = await db.account.findFirst({
    where: { accountNumber: args.toAccountNumber, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!to) return { failure: "recipientNotFound" };
  if (to.id === from.id) return { failure: "sameAccount" };
  if (to.currency !== from.currency) return { failure: "currencyMismatch" };

  return postTransaction({
    type: "TRANSFER",
    description: args.memo ?? null,
    idempotencyKey: args.idempotencyKey,
    postings: transferPostings(from.id, to.id, from.currency, args.amountMinor),
  });
}

/** Wallets plus the latest ledger entries across them (newest first), with the counterparty for transfers. */
export async function getWalletOverview(userId: string, historyLimit = 20) {
  const accounts = await db.account.findMany({
    where: { userId, kind: "CUSTOMER" },
    orderBy: { createdAt: "asc" },
  });

  const entries = await db.ledgerEntry.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: historyLimit,
    include: {
      transaction: {
        include: { entries: { include: { account: { select: { accountNumber: true, kind: true } } } } },
      },
    },
  });

  return { accounts, entries };
}
