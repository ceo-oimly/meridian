import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, toDecimalString, formatMoney, convert, MoneyError } from "./money.ts";

test("parseAmount handles USD cents and KRW whole won", () => {
  assert.equal(parseAmount("1250.50", "USD"), 125050n);
  assert.equal(parseAmount("1,250.5", "USD"), 125050n);
  assert.equal(parseAmount("7", "USD"), 700n);
  assert.equal(parseAmount("50000", "KRW"), 50000n);
});

test("parseAmount rejects too many decimals and junk", () => {
  assert.throws(() => parseAmount("1.234", "USD"), MoneyError);
  assert.throws(() => parseAmount("100.5", "KRW"), MoneyError);
  assert.throws(() => parseAmount("-5", "USD"), MoneyError);
  assert.throws(() => parseAmount("abc", "USD"), MoneyError);
  assert.throws(() => parseAmount("", "USD"), MoneyError);
});

test("toDecimalString round-trips, including small and negative values", () => {
  assert.equal(toDecimalString(125050n, "USD"), "1250.50");
  assert.equal(toDecimalString(5n, "USD"), "0.05");
  assert.equal(toDecimalString(-125n, "USD"), "-1.25");
  assert.equal(toDecimalString(50000n, "KRW"), "50000");
  assert.equal(toDecimalString(0n, "KRW"), "0");
});

test("formatMoney is locale aware", () => {
  assert.equal(formatMoney(125050n, "USD", "en-US"), "$1,250.50");
  assert.match(formatMoney(50000n, "KRW", "ko-KR"), /50,000/);
  assert.match(formatMoney(50000n, "KRW", "ko-KR"), /₩|원/);
});

test("convert USD -> KRW and back stays within rounding", () => {
  // $10.00 at 1380.25 = 13,802.5 won -> rounds half up to 13,803
  assert.equal(convert(1000n, "USD", "KRW", "1380.25"), 13803n);
  // 138,025 won at 0.00072451 USD per won = $100.00 (approximately)
  assert.equal(convert(138025n, "KRW", "USD", "0.00072451"), 10000n);
});

test("convert rejects negatives and bad rates", () => {
  assert.throws(() => convert(-1n, "USD", "KRW", "1380"), MoneyError);
  assert.throws(() => convert(100n, "USD", "KRW", "0"), MoneyError);
  assert.throws(() => convert(100n, "USD", "KRW", "x"), MoneyError);
});
