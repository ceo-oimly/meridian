import { db } from "./db";
import { DomainError } from "./ledger";
import { houseAccount, postTransaction } from "./ledgerService";
import { externalFee } from "./externalRules";

/** Simulated transfer to an outside bank. Amount plus fee leave the wallet now; an admin completes or refunds it. */
export async function createExternalTransfer(args: {
  userId: string;
  accountId: string;
  bank: string;
  recipientName: string;
  recipientAccount: string;
  amountMinor: bigint;
  idempotencyKey: string;
}) {
  const account = await db.account.findFirst({
    where: { id: args.accountId, userId: args.userId, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!account) throw new DomainError("transferFailed");
  const fee = externalFee(args.amountMinor, account.currency);
  const total = args.amountMinor + fee;
  const house = await houseAccount("EXTERNAL", account.currency);

  return postTransaction({
    type: "EXTERNAL_TRANSFER",
    description: `${args.bank} · ${args.recipientName}`,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: account.id, currency: account.currency, amountMinor: -total },
      { accountId: house.id, currency: account.currency, amountMinor: total },
    ],
    after: async (tx, txnId) => {
      const row = await tx.externalTransfer.create({
        data: {
          userId: args.userId,
          accountId: account.id,
          currency: account.currency,
          amountMinor: args.amountMinor,
          feeMinor: fee,
          bankName: args.bank,
          recipientName: args.recipientName,
          recipientAccount: args.recipientAccount,
          transactionId: txnId,
        },
        select: { id: true },
      });
      await tx.ledgerTransaction.update({ where: { id: txnId }, data: { reference: row.id } });
    },
  });
}

export async function completeExternal(id: string) {
  const row = await db.externalTransfer.findUnique({ where: { id }, select: { userId: true, amountMinor: true, currency: true } });
  const result = await db.externalTransfer.updateMany({
    where: { id, status: "PROCESSING" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (!row || result.count !== 1) throw new DomainError("alreadyDecided");
  return row;
}

/** Reject and refund amount plus fee through the ledger. */
export async function rejectExternal(id: string, reason: string) {
  const row = await db.externalTransfer.findUnique({ where: { id } });
  if (!row || row.status !== "PROCESSING") throw new DomainError("alreadyDecided");
  const total = row.amountMinor + row.feeMinor;
  const house = await houseAccount("EXTERNAL", row.currency);
  await postTransaction({
    type: "REVERSAL",
    description: `Refund: ${row.bankName}`,
    reference: row.id,
    idempotencyKey: `external-refund:${row.id}`,
    postings: [
      { accountId: house.id, currency: row.currency, amountMinor: -total },
      { accountId: row.accountId, currency: row.currency, amountMinor: total },
    ],
    after: async (tx) => {
      const changed = await tx.externalTransfer.updateMany({
        where: { id: row.id, status: "PROCESSING" },
        data: { status: "REJECTED", decisionReason: reason, completedAt: new Date() },
      });
      if (changed.count !== 1) throw new DomainError("alreadyDecided");
    },
  });
  return row;
}
