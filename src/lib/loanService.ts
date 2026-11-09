import { db } from "./db";
import { DomainError } from "./ledger";
import { houseAccount, postTransaction } from "./ledgerService";
import { aprBpsForTerm, buildSchedule, isLoanTerm } from "./loanRules";

export async function applyForLoan(args: {
  userId: string;
  accountId: string;
  principalMinor: bigint;
  termMonths: number;
  purpose: string;
}) {
  if (!isLoanTerm(args.termMonths)) throw new DomainError("loanTermInvalid");
  const account = await db.account.findFirst({
    where: { id: args.accountId, userId: args.userId, kind: "CUSTOMER" },
    select: { currency: true, status: true },
  });
  if (!account) throw new DomainError("transferFailed");
  if (account.status !== "ACTIVE") throw new DomainError("accountRestricted");
  const open = await db.loan.count({ where: { userId: args.userId, status: { in: ["PENDING", "ACTIVE"] } } });
  if (open > 0) throw new DomainError("loanExists");

  return db.loan.create({
    data: {
      userId: args.userId,
      accountId: args.accountId,
      currency: account.currency,
      principalMinor: args.principalMinor,
      aprBps: aprBpsForTerm(args.termMonths),
      termMonths: args.termMonths,
      purpose: args.purpose,
    },
    select: { id: true },
  });
}

/** Approve a pending loan: pay the money into the wallet and create the repayment schedule, all in one transaction. */
export async function approveLoan(loanId: string, note: string | null) {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan || loan.status !== "PENDING") throw new DomainError("alreadyDecided");
  const house = await houseAccount("LOAN", loan.currency);
  const now = new Date();
  const schedule = buildSchedule(loan.principalMinor, loan.aprBps, loan.termMonths, now);

  const result = await postTransaction({
    type: "LOAN_DISBURSEMENT",
    description: `Loan ${loan.id.slice(-6)}`,
    reference: loan.id,
    idempotencyKey: `loan-approve:${loan.id}`,
    postings: [
      { accountId: house.id, currency: loan.currency, amountMinor: -loan.principalMinor },
      { accountId: loan.accountId, currency: loan.currency, amountMinor: loan.principalMinor },
    ],
    after: async (tx) => {
      const changed = await tx.loan.updateMany({
        where: { id: loan.id, status: "PENDING" },
        data: { status: "ACTIVE", decisionReason: note, decidedAt: now, disbursedAt: now },
      });
      if (changed.count !== 1) throw new DomainError("alreadyDecided");
      await tx.loanInstallment.createMany({
        data: schedule.map((s) => ({
          loanId: loan.id,
          number: s.number,
          dueDate: s.dueDate,
          principalMinor: s.principalMinor,
          interestMinor: s.interestMinor,
        })),
      });
    },
  });
  return { userId: loan.userId, ...result };
}

export async function rejectLoan(loanId: string, reason: string) {
  const loan = await db.loan.findUnique({ where: { id: loanId }, select: { userId: true } });
  const result = await db.loan.updateMany({
    where: { id: loanId, status: "PENDING" },
    data: { status: "REJECTED", decisionReason: reason, decidedAt: new Date() },
  });
  if (!loan || result.count !== 1) throw new DomainError("alreadyDecided");
  return { userId: loan.userId };
}

/** Pay the next unpaid instalment. When the last one is paid the loan is marked PAID. */
export async function repayNextInstallment(args: { userId: string; loanId: string; idempotencyKey: string }) {
  const loan = await db.loan.findFirst({
    where: { id: args.loanId, userId: args.userId, status: "ACTIVE" },
    include: { installments: { where: { paidAt: null }, orderBy: { number: "asc" }, take: 1 } },
  });
  const next = loan?.installments[0];
  if (!loan || !next) throw new DomainError("alreadyPaid");
  const amount = next.principalMinor + next.interestMinor;
  const house = await houseAccount("LOAN", loan.currency);

  return postTransaction({
    type: "LOAN_REPAYMENT",
    description: `Loan ${loan.id.slice(-6)} · ${next.number}/${loan.termMonths}`,
    reference: loan.id,
    idempotencyKey: args.idempotencyKey,
    postings: [
      { accountId: loan.accountId, currency: loan.currency, amountMinor: -amount },
      { accountId: house.id, currency: loan.currency, amountMinor: amount },
    ],
    after: async (tx) => {
      const changed = await tx.loanInstallment.updateMany({
        where: { id: next.id, paidAt: null },
        data: { paidAt: new Date() },
      });
      if (changed.count !== 1) throw new DomainError("alreadyPaid");
      const remaining = await tx.loanInstallment.count({ where: { loanId: loan.id, paidAt: null } });
      if (remaining === 0) await tx.loan.update({ where: { id: loan.id }, data: { status: "PAID" } });
    },
  });
}
