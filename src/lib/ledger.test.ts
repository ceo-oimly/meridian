import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertBalanced,
  assertStatusAllows,
  assertSufficientFunds,
  transferPostings,
  reversalPostings,
  LedgerError,
} from "./ledger.ts";

test("transfer postings are balanced", () => {
  const postings = transferPostings("a", "b", "USD", 2500n);
  assert.deepEqual(postings.map((p) => p.amountMinor), [-2500n, 2500n]);
  assertBalanced(postings);
});

test("unbalanced, single-sided and zero postings are rejected", () => {
  assert.throws(
    () =>
      assertBalanced([
        { accountId: "a", currency: "USD", amountMinor: -100n },
        { accountId: "b", currency: "USD", amountMinor: 99n },
      ]),
    LedgerError,
  );
  assert.throws(
    () => assertBalanced([{ accountId: "a", currency: "USD", amountMinor: 100n }]),
    LedgerError,
  );
  assert.throws(
    () =>
      assertBalanced([
        { accountId: "a", currency: "USD", amountMinor: 0n },
        { accountId: "b", currency: "USD", amountMinor: 0n },
      ]),
    LedgerError,
  );
});

test("balance is checked per currency (no cross-currency netting)", () => {
  assert.throws(
    () =>
      assertBalanced([
        { accountId: "a", currency: "USD", amountMinor: -100n },
        { accountId: "b", currency: "KRW", amountMinor: 100n },
      ]),
    LedgerError,
  );
});

test("FX conversion balances via system FX accounts in each currency", () => {
  assertBalanced([
    { accountId: "user-usd", currency: "USD", amountMinor: -1000n },
    { accountId: "fx-usd", currency: "USD", amountMinor: 1000n },
    { accountId: "fx-krw", currency: "KRW", amountMinor: -13803n },
    { accountId: "user-krw", currency: "KRW", amountMinor: 13803n },
  ]);
});

test("account status gates debits and credits", () => {
  const debit = { accountId: "a", currency: "USD" as const, amountMinor: -1n };
  const credit = { accountId: "a", currency: "USD" as const, amountMinor: 1n };
  assertStatusAllows("ACTIVE", debit);
  assertStatusAllows("ACTIVE", credit);
  assertStatusAllows("DORMANT", credit); // can receive money
  for (const status of ["FROZEN", "SUSPENDED", "DORMANT", "CLOSED"] as const) {
    assert.throws(() => assertStatusAllows(status, debit), LedgerError, `${status} debit`);
  }
  for (const status of ["FROZEN", "SUSPENDED", "CLOSED"] as const) {
    assert.throws(() => assertStatusAllows(status, credit), LedgerError, `${status} credit`);
  }
});

test("customer accounts cannot overdraw; system accounts can", () => {
  const debit = { accountId: "a", currency: "USD" as const, amountMinor: -500n };
  assertSufficientFunds(500n, debit, false);
  assert.throws(() => assertSufficientFunds(499n, debit, false), LedgerError);
  assertSufficientFunds(0n, debit, true);
});

test("transfer validation", () => {
  assert.throws(() => transferPostings("a", "a", "USD", 100n), LedgerError);
  assert.throws(() => transferPostings("a", "b", "USD", 0n), LedgerError);
  assert.throws(() => transferPostings("a", "b", "USD", -5n), LedgerError);
});

test("reversal exactly cancels the original", () => {
  const original = transferPostings("a", "b", "USD", 777n);
  const reversal = reversalPostings(original);
  assertBalanced(reversal);
  const net = [...original, ...reversal].reduce((s, p) => s + p.amountMinor, 0n);
  assert.equal(net, 0n);
  assert.equal(reversal[0].amountMinor, 777n);
});
