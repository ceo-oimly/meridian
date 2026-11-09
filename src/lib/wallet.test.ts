import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAmount, TRANSFER_MAX_MINOR } from "./limits.ts";
import { isPinLocked, afterPinFailure, attemptsLeft, MAX_PIN_ATTEMPTS } from "./pinLock.ts";
import { ledgerErrorKey, assertStatusAllows, assertSufficientFunds } from "./ledger.ts";

test("amount limits scale per currency", () => {
  assert.equal(checkAmount(0n, "USD", TRANSFER_MAX_MINOR), "notPositive");
  assert.equal(checkAmount(-5n, "USD", TRANSFER_MAX_MINOR), "notPositive");
  assert.equal(checkAmount(500_000n, "USD", TRANSFER_MAX_MINOR), "ok"); // $5,000.00
  assert.equal(checkAmount(500_001n, "USD", TRANSFER_MAX_MINOR), "overLimit");
  assert.equal(checkAmount(5_000_000n, "KRW", TRANSFER_MAX_MINOR), "ok"); // ₩5,000,000
  assert.equal(checkAmount(5_000_001n, "KRW", TRANSFER_MAX_MINOR), "overLimit");
  assert.equal(checkAmount(700_000n, "JPY", TRANSFER_MAX_MINOR), "ok");
  assert.equal(checkAmount(700_001n, "JPY", TRANSFER_MAX_MINOR), "overLimit");
});

test("PIN locks on the 5th consecutive miss, then resets the counter", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  let failed = 0;
  for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
    const s = afterPinFailure(failed, now);
    assert.equal(s.lockedUntil, null);
    assert.equal(s.failedAttempts, i);
    failed = s.failedAttempts;
  }
  const locked = afterPinFailure(failed, now);
  assert.equal(locked.failedAttempts, 0);
  assert.equal(locked.lockedUntil?.toISOString(), "2026-11-02T12:15:00.000Z");
});

test("lock expiry and attempts left", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(isPinLocked(null, now), false);
  assert.equal(isPinLocked(new Date("2026-11-02T12:00:01Z"), now), true);
  assert.equal(isPinLocked(new Date("2026-11-02T12:00:00Z"), now), false);
  assert.equal(attemptsLeft(0), 5);
  assert.equal(attemptsLeft(4), 1);
  assert.equal(attemptsLeft(9), 0);
});

test("ledger errors map to translation keys", () => {
  const debit = { accountId: "a", currency: "USD" as const, amountMinor: -500n };
  let key = "";
  try {
    assertSufficientFunds(100n, debit, false);
  } catch (e) {
    key = ledgerErrorKey(e);
  }
  assert.equal(key, "insufficientFunds");

  try {
    assertStatusAllows("FROZEN", debit);
  } catch (e) {
    key = ledgerErrorKey(e);
  }
  assert.equal(key, "accountRestricted");

  assert.equal(ledgerErrorKey(new Error("boom")), "transferFailed");
});
