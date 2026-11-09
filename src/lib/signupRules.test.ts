import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passwordStrength,
  isAdult,
  isValidBirthDate,
  isValidPostalCode,
  normalizePhone,
  buildFullName,
  isCountry,
  isValidPin,
} from "./signupRules.ts";
import { generateAccountNumber } from "./accountNumber.ts";

const TODAY = new Date(Date.UTC(2026, 10, 2)); // 2026-11-02

test("password strength levels", () => {
  assert.equal(passwordStrength("short1!"), 0);
  assert.equal(passwordStrength("alllowercaseletters"), 2); // 12+ and 16+ only
  assert.equal(passwordStrength("aaaaaaaaaaaaaaaaaaaa"), 1); // repeated run caps it
  assert.equal(passwordStrength("Tr1cky-Passw0rd"), 3);
  assert.equal(passwordStrength("Tr1cky-Passw0rd-Longer!"), 4);
});

test("adult check handles birthdays exactly", () => {
  assert.equal(isAdult("2008-11-02", TODAY), true); // turns 18 today
  assert.equal(isAdult("2008-11-03", TODAY), false); // turns 18 tomorrow
  assert.equal(isAdult("1990-05-20", TODAY), true);
  assert.equal(isAdult("2015-01-01", TODAY), false);
});

test("birth date validation rejects impossible and future dates", () => {
  assert.equal(isValidBirthDate("2001-02-30", TODAY), false);
  assert.equal(isValidBirthDate("2001-13-01", TODAY), false);
  assert.equal(isValidBirthDate("01/02/2001", TODAY), false);
  assert.equal(isValidBirthDate("2030-01-01", TODAY), false);
  assert.equal(isValidBirthDate("1800-01-01", TODAY), false);
  assert.equal(isValidBirthDate("2000-02-29", TODAY), true); // leap day
  assert.equal(isValidBirthDate("2001-02-29", TODAY), false); // not a leap year
});

test("postal codes per country", () => {
  assert.equal(isValidPostalCode("US", "94105"), true);
  assert.equal(isValidPostalCode("US", "94105-1234"), true);
  assert.equal(isValidPostalCode("US", "9410"), false);
  assert.equal(isValidPostalCode("KR", "06236"), true);
  assert.equal(isValidPostalCode("KR", "06236-1234"), false);
});

test("phone numbers normalize to E.164", () => {
  assert.equal(normalizePhone("US", "(415) 555-0132"), "+14155550132");
  assert.equal(normalizePhone("US", "1 415 555 0132"), "+14155550132");
  assert.equal(normalizePhone("KR", "010-1234-5678"), "+821012345678");
  assert.equal(normalizePhone("KR", "02-123-4567"), "+8221234567");
  assert.equal(normalizePhone("US", "+82 10-1234-5678"), "+821012345678");
  assert.equal(normalizePhone("US", "123"), null);
  assert.equal(normalizePhone("US", "055-5555"), null);
  assert.equal(normalizePhone("KR", "abc"), null);
  assert.equal(normalizePhone("KR", "+0123456789"), null);
});

test("full name order follows local convention", () => {
  assert.equal(buildFullName("US", " Ada ", "Lovelace"), "Ada Lovelace");
  assert.equal(buildFullName("KR", "민준", "김"), "김민준");
});

test("PIN rules", () => {
  assert.equal(isValidPin("1357"), true);
  assert.equal(isValidPin("246810"), true);
  assert.equal(isValidPin("0000"), false);
  assert.equal(isValidPin("1234"), false);
  assert.equal(isValidPin("4321"), false);
  assert.equal(isValidPin("123"), false);
  assert.equal(isValidPin("1234567"), false);
  assert.equal(isValidPin("12ab"), false);
});

test("country guard", () => {
  assert.equal(isCountry("US"), true);
  assert.equal(isCountry("KR"), true);
  assert.equal(isCountry("NG"), false);
  assert.equal(isCountry(undefined), false);
});

test("account numbers are 10 digits and don't start with 0", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const n = generateAccountNumber();
    assert.match(n, /^[1-9]\d{9}$/);
    seen.add(n);
  }
  assert.ok(seen.size > 490); // essentially no collisions in 500 draws
});
