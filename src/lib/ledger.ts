// Pure ledger rules. No database access here so they are easy to unit test.
// The database layer calls these BEFORE writing, inside one DB transaction.

import type { CurrencyCode } from "./money.ts";

export type AccountStatus = "ACTIVE" | "FROZEN" | "SUSPENDED" | "DORMANT" | "CLOSED";

export interface Posting {
  accountId: string;
  currency: CurrencyCode;
  /** Signed minor units: positive = credit, negative = debit. */
  amountMinor: bigint;
}

export class LedgerError extends Error {}

/** A transaction needs 2+ non-zero postings that sum to zero within each currency. */
export function assertBalanced(postings: Posting[]): void {
  if (postings.length < 2) {
    throw new LedgerError("A transaction needs at least two postings");
  }
  const sums = new Map<CurrencyCode, bigint>();
  for (const p of postings) {
    if (p.amountMinor === 0n) throw new LedgerError("Postings must be non-zero");
    sums.set(p.currency, (sums.get(p.currency) ?? 0n) + p.amountMinor);
  }
  for (const [currency, sum] of sums) {
    if (sum !== 0n) {
      throw new LedgerError(`Unbalanced transaction in ${currency}: off by ${sum}`);
    }
  }
}

/** Which account statuses may be debited / credited. */
const CAN_DEBIT: Record<AccountStatus, boolean> = {
  ACTIVE: true,
  FROZEN: false,
  SUSPENDED: false,
  DORMANT: false,
  CLOSED: false,
};

const CAN_CREDIT: Record<AccountStatus, boolean> = {
  ACTIVE: true,
  FROZEN: false,
  SUSPENDED: false,
  DORMANT: true, // incoming money is allowed; the owner must reactivate to spend
  CLOSED: false,
};

export function assertStatusAllows(status: AccountStatus, posting: Posting): void {
  const allowed = posting.amountMinor < 0n ? CAN_DEBIT[status] : CAN_CREDIT[status];
  if (!allowed) {
    const dir = posting.amountMinor < 0n ? "debited" : "credited";
    throw new LedgerError(`Account ${posting.accountId} is ${status} and cannot be ${dir}`);
  }
}

/** Customer accounts cannot go negative. System accounts may (they act as settlement / central reserves). */
export function assertSufficientFunds(
  currentBalanceMinor: bigint,
  posting: Posting,
  isSystemAccount: boolean,
): void {
  if (isSystemAccount || posting.amountMinor >= 0n) return;
  if (currentBalanceMinor + posting.amountMinor < 0n) {
    throw new LedgerError(`Insufficient funds in account ${posting.accountId}`);
  }
}

/** A business-rule failure with a ready-made translation key (key lives under "Wallet.errors"). */
export class DomainError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(key);
    this.key = key;
  }
}

/** Map any thrown error to a translation key under "Wallet.errors" / "Admin.errors". */
export function ledgerErrorKey(e: unknown): string {
  if (e instanceof DomainError) return e.key;
  if (!(e instanceof LedgerError)) return "transferFailed";
  if (/holdings/i.test(e.message)) return "insufficientHoldings";
  if (e.message.startsWith("Insufficient")) return "insufficientFunds";
  if (/is (FROZEN|SUSPENDED|DORMANT|CLOSED)/.test(e.message)) return "accountRestricted";
  return "transferFailed";
}

/** Build the postings for a transfer between two accounts of the same currency. */
export function transferPostings(
  fromAccountId: string,
  toAccountId: string,
  currency: CurrencyCode,
  amountMinor: bigint,
): Posting[] {
  if (amountMinor <= 0n) throw new LedgerError("Transfer amount must be positive");
  if (fromAccountId === toAccountId) throw new LedgerError("Cannot transfer to the same account");
  return [
    { accountId: fromAccountId, currency, amountMinor: -amountMinor },
    { accountId: toAccountId, currency, amountMinor },
  ];
}

/** Postings that exactly undo a previous transaction (append-only corrections). */
export function reversalPostings(original: Posting[]): Posting[] {
  return original.map((p) => ({ ...p, amountMinor: -p.amountMinor }));
}
