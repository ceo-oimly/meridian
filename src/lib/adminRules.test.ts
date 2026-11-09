import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReason, isAdminStatus, canClose } from "./adminRules.ts";
import { checkAmount, ADMIN_ADJUST_MAX_MINOR } from "./limits.ts";

test("reason is required and tidied", () => {
  assert.equal(cleanReason("  Refund   for   order 12 "), "Refund for order 12");
  assert.equal(cleanReason(""), null);
  assert.equal(cleanReason("  ab "), null);
  assert.equal(cleanReason("abc"), "abc");
  assert.equal(cleanReason("x".repeat(200)), "x".repeat(200));
  assert.equal(cleanReason("x".repeat(201)), null);
});

test("status guard only allows known statuses", () => {
  for (const s of ["ACTIVE", "FROZEN", "SUSPENDED", "DORMANT", "CLOSED"]) assert.equal(isAdminStatus(s), true);
  assert.equal(isAdminStatus("DELETED"), false);
  assert.equal(isAdminStatus("active"), false);
  assert.equal(isAdminStatus(""), false);
});

test("accounts can only be closed when empty", () => {
  assert.equal(canClose(0n), true);
  assert.equal(canClose(1n), false);
  assert.equal(canClose(-1n), false);
});

test("admin adjustment limits", () => {
  assert.equal(checkAmount(100_000_000n, "USD", ADMIN_ADJUST_MAX_MINOR), "ok");
  assert.equal(checkAmount(100_000_001n, "USD", ADMIN_ADJUST_MAX_MINOR), "overLimit");
  assert.equal(checkAmount(1_000_000_000n, "KRW", ADMIN_ADJUST_MAX_MINOR), "ok");
  assert.equal(checkAmount(0n, "KRW", ADMIN_ADJUST_MAX_MINOR), "notPositive");
});

import { isInactive, DORMANT_AFTER_DAYS } from "./adminRules.ts";

test("dormancy after 180 days of inactivity", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  assert.equal(DORMANT_AFTER_DAYS, 180);
  assert.equal(isInactive(new Date("2026-05-12T00:00:00Z"), now), true); // 180+ days ago
  assert.equal(isInactive(new Date("2026-05-13T00:00:00Z"), now), false); // exactly 179 days
  assert.equal(isInactive(new Date("2026-11-01T00:00:00Z"), now), false);
});
