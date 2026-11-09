import { db } from "./db";
import { DomainError } from "./ledger";
import { postTransaction } from "./ledgerService";
import type { CurrencyCode } from "./money";

export async function createPaymentRequest(args: {
  requesterId: string;
  toAccountId: string;
  payerEmail: string;
  amountMinor: bigint;
  note: string | null;
}) {
  const to = await db.account.findFirst({
    where: { id: args.toAccountId, userId: args.requesterId, kind: "CUSTOMER" },
    select: { currency: true },
  });
  if (!to) throw new DomainError("transferFailed");
  const payer = await db.user.findUnique({ where: { email: args.payerEmail }, select: { id: true } });
  if (!payer) throw new DomainError("payerNotFound");
  if (payer.id === args.requesterId) throw new DomainError("sameAccount");
  return db.paymentRequest.create({
    data: {
      requesterId: args.requesterId,
      payerId: payer.id,
      toAccountId: args.toAccountId,
      currency: to.currency as CurrencyCode,
      amountMinor: args.amountMinor,
      note: args.note,
    },
    select: { id: true },
  });
}

export async function payRequest(args: { userId: string; requestId: string; idempotencyKey: string }) {
  const req = await db.paymentRequest.findFirst({
    where: { id: args.requestId, payerId: args.userId, status: "PENDING" },
  });
  if (!req) throw new DomainError("alreadyDecided");
  const payerWallet = await db.account.findFirst({
    where: { userId: args.userId, currency: req.currency, kind: "CUSTOMER" },
    select: { id: true },
  });
  if (!payerWallet) throw new DomainError("payerNoWallet");

  return postTransaction({
    type: "TRANSFER",
    description: req.note ?? null,
    reference: req.id,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: payerWallet.id, currency: req.currency, amountMinor: -req.amountMinor },
      { accountId: req.toAccountId, currency: req.currency, amountMinor: req.amountMinor },
    ],
    after: async (tx) => {
      const changed = await tx.paymentRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: "PAID", payerAccountId: payerWallet.id, resolvedAt: new Date() },
      });
      if (changed.count !== 1) throw new DomainError("alreadyDecided");
    },
  });
}

/** The payer declines, or the requester cancels. Only pending requests can change. */
export async function closeRequest(userId: string, requestId: string, as: "payer" | "requester") {
  const result = await db.paymentRequest.updateMany({
    where: { id: requestId, status: "PENDING", ...(as === "payer" ? { payerId: userId } : { requesterId: userId }) },
    data: { status: as === "payer" ? "DECLINED" : "CANCELLED", resolvedAt: new Date() },
  });
  if (result.count !== 1) throw new DomainError("alreadyDecided");
}
