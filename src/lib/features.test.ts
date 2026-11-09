import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENCIES, CURRENCY_EXPONENT, isCurrency, parseAmount, toDecimalString, formatMoney,
  convert, applySpread, trimRate, scaledRateToString,
} from "./money.ts";
import { LOAN_TERMS, aprBpsForTerm, monthlyPayment, buildSchedule, addMonths, isLoanTerm } from "./loanRules.ts";
import {
  parsePriceUsd, unitsForUsd, usdForUnits, parseUnits, formatUnits, isCryptoSymbol,
} from "./cryptoMath.ts";
import { toCsv, csvSafeText } from "./csv.ts";
import { createLimiter } from "./rateLimit.ts";
import { isDormant, dormantCutoff } from "./dormancy.ts";
import { historyLabelKey } from "./historyLabels.ts";
import { welcomeEmail, loanDecisionEmail, moneyReceivedEmail, externalDecisionEmail } from "./emailTemplates.ts";
import { assertBalanced } from "./ledger.ts";

test("every supported currency has an exponent and parses/prints amounts", () => {
  for (const c of CURRENCIES) {
    assert.equal(isCurrency(c), true);
    const exp = CURRENCY_EXPONENT[c];
    const text = exp === 0 ? "1500" : "1500.25";
    const minor = parseAmount(text, c);
    assert.equal(toDecimalString(minor, c), text);
  }
  assert.equal(isCurrency("XYZ"), false);
  assert.equal(CURRENCY_EXPONENT.JPY, 0);
  assert.equal(CURRENCY_EXPONENT.KRW, 0);
  assert.match(formatMoney(1500n, "JPY", "ja-JP"), /1,500/);
});

test("FX spread reduces the rate and conversion stays exact", () => {
  assert.equal(applySpread("1380.25", 50), "1373.34875000"); // 0.5% off
  assert.equal(trimRate("1373.34875000"), "1373.34875");
  assert.equal(trimRate("2.00000000"), "2");
  assert.equal(scaledRateToString(138025000000n), "1380.25000000");
  assert.throws(() => applySpread("1380.25", 10_000));
  // $100.00 -> won at the spread rate, round half up
  const out = convert(10_000n, "USD", "KRW", applySpread("1380.25", 50));
  assert.equal(out, 137335n); // 100 * 1373.34875 = 137,334.875 -> 137,335
  // EUR (2dp) to JPY (0dp)
  assert.equal(convert(1000n, "EUR", "JPY", "160"), 1600n);
});

test("FX conversion posts balance in every currency", () => {
  assertBalanced([
    { accountId: "user-usd", currency: "USD", amountMinor: -10_000n },
    { accountId: "fx-usd", currency: "USD", amountMinor: 10_000n },
    { accountId: "fx-krw", currency: "KRW", amountMinor: -137_335n },
    { accountId: "user-krw", currency: "KRW", amountMinor: 137_335n },
  ]);
});

test("loan terms and rates", () => {
  assert.equal(isLoanTerm(12), true);
  assert.equal(isLoanTerm(13), false);
  assert.deepEqual([...LOAN_TERMS], [3, 6, 12, 24, 36]);
  assert.equal(aprBpsForTerm(3), 900);
  assert.equal(aprBpsForTerm(12), 1100);
  assert.equal(aprBpsForTerm(36), 1500);
});

test("monthly payment matches the standard amortisation formula", () => {
  // $1,200 at 12% APR over 12 months = $106.62 (106.6185...)
  assert.equal(monthlyPayment(120_000n, 1200, 12), 10_662n);
  // 0% APR splits evenly, rounding up
  assert.equal(monthlyPayment(1000n, 0, 3), 334n);
  assert.throws(() => monthlyPayment(0n, 1200, 12));
});

test("schedule repays principal exactly and ends at zero", () => {
  const start = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
  const schedule = buildSchedule(120_000n, 1200, 12, start);
  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].interestMinor, 1_200n); // 1% of $1,200.00
  assert.equal(schedule.reduce((s, i) => s + i.principalMinor, 0n), 120_000n);
  for (const i of schedule) assert.equal(i.amountMinor, i.principalMinor + i.interestMinor);
  const last = schedule[11].amountMinor;
  assert.ok(last >= 10_600n && last <= 10_700n, `last installment ${last}`);
  assert.equal(schedule[0].dueDate.toISOString(), "2026-02-28T12:00:00.000Z"); // Jan 31 + 1 month clamps
  assert.equal(schedule[1].dueDate.toISOString(), "2026-03-31T12:00:00.000Z");
});

test("schedule works for zero-decimal currencies and 0% APR", () => {
  const schedule = buildSchedule(1_000_000n, 1100, 6, new Date(Date.UTC(2026, 5, 15)));
  assert.equal(schedule.reduce((s, i) => s + i.principalMinor, 0n), 1_000_000n);
  const flat = buildSchedule(1000n, 0, 3, new Date(Date.UTC(2026, 5, 15)));
  assert.deepEqual(flat.map((i) => i.amountMinor), [334n, 334n, 332n]);
});

test("addMonths handles leap years and year ends", () => {
  assert.equal(addMonths(new Date(Date.UTC(2024, 0, 31)), 1).toISOString().slice(0, 10), "2024-02-29");
  assert.equal(addMonths(new Date(Date.UTC(2026, 10, 30)), 3).toISOString().slice(0, 10), "2027-02-28");
  assert.equal(addMonths(new Date(Date.UTC(2026, 11, 15)), 1).toISOString().slice(0, 10), "2027-01-15");
});

test("crypto maths round-trips in integers", () => {
  const price = parsePriceUsd(50_000)!;
  assert.equal(price, 5_000_000_000_000n);
  assert.equal(unitsForUsd(10_000n, price), 200_000n); // $100 -> 0.002 BTC
  assert.equal(usdForUnits(200_000n, price), 10_000n);
  assert.equal(unitsForUsd(1n, price), 20n); // 1 cent = 2e-7 BTC = 20 units
  assert.equal(unitsForUsd(1n, parsePriceUsd(5_000_000)!), 0n); // below one unit: caller must reject
  assert.equal(parsePriceUsd(0), null);
  assert.equal(parsePriceUsd(-5), null);
  assert.equal(parsePriceUsd(Number.NaN), null);
  assert.equal(parseUnits("0.002"), 200_000n);
  assert.equal(parseUnits("1"), 100_000_000n);
  assert.equal(parseUnits("0.000000001"), null); // 9 decimals
  assert.equal(parseUnits("0"), null);
  assert.equal(parseUnits("-1"), null);
  assert.equal(formatUnits(200_000n), "0.002");
  assert.equal(formatUnits(100_000_000n), "1");
  assert.equal(formatUnits(1n), "0.00000001");
  assert.equal(isCryptoSymbol("BTC"), true);
  assert.equal(isCryptoSymbol("DOGE"), false);
  // cheap coin
  const xrp = parsePriceUsd(0.55)!;
  assert.equal(unitsForUsd(5_500n, xrp), 10_000_000_000n); // $55 / $0.55 = 100 XRP
});

test("CSV quotes cells and neutralises formula injection", () => {
  assert.equal(toCsv([["a", "b,c", 'd"e']]), 'a,"b,c","d""e"\r\n');
  assert.equal(toCsv([["x"], ["line\nbreak"]]), 'x\r\n"line\nbreak"\r\n');
  assert.equal(csvSafeText("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvSafeText("+1"), "'+1");
  assert.equal(csvSafeText("@sum"), "'@sum");
  assert.equal(csvSafeText("Coffee shop"), "Coffee shop");
});

test("rate limiter allows N hits per window then recovers", () => {
  const limiter = createLimiter(3, 1000);
  assert.equal(limiter.hit("a", 0), true);
  assert.equal(limiter.hit("a", 100), true);
  assert.equal(limiter.hit("a", 200), true);
  assert.equal(limiter.hit("a", 300), false);
  assert.equal(limiter.hit("b", 300), true); // other keys unaffected
  assert.equal(limiter.hit("a", 1001), true); // oldest hit expired
  limiter.reset("a");
  assert.equal(limiter.hit("a", 1002), true);
});

test("dormancy after 180 days of no activity", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  assert.equal(isDormant(new Date("2026-01-01T00:00:00Z"), now), true);
  assert.equal(isDormant(new Date("2026-06-01T00:00:00Z"), now), false);
  assert.equal(dormantCutoff(now).toISOString(), "2026-05-12T00:00:00.000Z");
});

test("history labels cover every transaction type", () => {
  assert.equal(historyLabelKey("TRANSFER", true), null);
  assert.equal(historyLabelKey("ADMIN_ADJUSTMENT", true), "adjustmentCredit");
  assert.equal(historyLabelKey("ADMIN_ADJUSTMENT", false), "adjustmentDebit");
  assert.equal(historyLabelKey("FX_CONVERSION", true), "fxIn");
  assert.equal(historyLabelKey("FX_CONVERSION", false), "fxOut");
  assert.equal(historyLabelKey("CARD_PURCHASE", false), "card");
  assert.equal(historyLabelKey("LOAN_DISBURSEMENT", true), "loanDisbursed");
  assert.equal(historyLabelKey("LOAN_REPAYMENT", false), "loanRepaid");
  assert.equal(historyLabelKey("CRYPTO_TRADE", true), "cryptoSell");
  assert.equal(historyLabelKey("CRYPTO_TRADE", false), "cryptoBuy");
  assert.equal(historyLabelKey("EXTERNAL_TRANSFER", false), "external");
  assert.equal(historyLabelKey("REVERSAL", true), "reversal");
  assert.equal(historyLabelKey("SOMETHING_NEW", true), "other");
});

test("email templates exist in both languages and include the details", () => {
  for (const locale of ["en", "ko"]) {
    const w = welcomeEmail(locale, "Ada");
    assert.ok(w.subject.length > 0 && w.text.includes("Ada"));
    const r = moneyReceivedEmail(locale, "Ada", "$5.00", "Bo");
    assert.ok(r.text.includes("$5.00") && r.text.includes("Bo"));
    const yes = loanDecisionEmail(locale, "Ada", true, null);
    const no = loanDecisionEmail(locale, "Ada", false, "Income too low");
    assert.notEqual(yes.subject, no.subject);
    assert.ok(no.text.includes("Income too low"));
    const ext = externalDecisionEmail(locale, "Ada", false, "$9.00", "Wrong account");
    assert.ok(ext.text.includes("$9.00") && ext.text.includes("Wrong account"));
  }
});

import { generateCardNumber, luhnValid, checkCardPurchase, defaultCardLimits, formatCardNumber, generateCvv } from "./cards.ts";
import { externalFee, isKnownBank, isValidExternalAccount } from "./externalRules.ts";
import { customerRate, midRate, cleanRates, FALLBACK_USD_RATES } from "./fxRates.ts";

test("card numbers pass Luhn, start with 9, and format in groups", () => {
  for (let i = 0; i < 50; i++) {
    const n = generateCardNumber();
    assert.equal(n.length, 16);
    assert.equal(n[0], "9");
    assert.equal(luhnValid(n), true);
  }
  assert.equal(formatCardNumber("9123456789012345"), "9123 4567 8901 2345");
  assert.match(generateCvv(), /^\d{3}$/);
});

test("card purchase checks run in a sensible order", () => {
  const base = {
    status: "ACTIVE" as const, expMonth: 12, expYear: 2030, now: new Date("2026-11-09T00:00:00Z"),
    amountMinor: 1_000n, perTxLimitMinor: 5_000n, monthlyLimitMinor: 10_000n, spentThisMonthMinor: 0n,
  };
  assert.equal(checkCardPurchase(base), "ok");
  assert.equal(checkCardPurchase({ ...base, status: "BLOCKED" }), "cardBlocked");
  assert.equal(checkCardPurchase({ ...base, status: "FROZEN" }), "cardFrozen");
  assert.equal(checkCardPurchase({ ...base, expYear: 2026, expMonth: 10 }), "cardExpired");
  assert.equal(checkCardPurchase({ ...base, expYear: 2026, expMonth: 11 }), "ok");
  assert.equal(checkCardPurchase({ ...base, amountMinor: 5_001n }), "overTxLimit");
  assert.equal(checkCardPurchase({ ...base, spentThisMonthMinor: 9_500n }), "overMonthlyLimit");
  assert.equal(checkCardPurchase({ ...base, amountMinor: 0n }), "amountInvalid");
  assert.equal(defaultCardLimits("USD").monthly, 200_000n);
  assert.equal(defaultCardLimits("KRW").perTx, 500_000n);
});

test("external transfer fee and input checks", () => {
  assert.equal(externalFee(100_000n, "USD"), 500n); // $1,000 -> $5.00
  assert.equal(externalFee(1_000n, "USD"), 100n); // minimum $1.00
  assert.equal(externalFee(1_000_000n, "KRW"), 5_000n);
  assert.equal(externalFee(10_000n, "KRW"), 50n);
  assert.equal(isKnownBank("Han River Bank"), true);
  assert.equal(isKnownBank("Real Bank"), false);
  assert.equal(isValidExternalAccount("12345678"), true);
  assert.equal(isValidExternalAccount("1234"), false);
  assert.equal(isValidExternalAccount("1234abcd"), false);
});

test("FX: cross rates, spread and conversion round-trip loses only the spread", () => {
  const rates = FALLBACK_USD_RATES;
  assert.equal(midRate(rates, "USD", "KRW"), "1380.00000000");
  assert.equal(midRate(rates, "KRW", "USD").startsWith("0.00072463"), true);
  assert.equal(customerRate(rates, "USD", "KRW"), "1373.10000000"); // 1380 less 0.5%
  const krw = convert(10_000n, "USD", "KRW", customerRate(rates, "USD", "KRW")); // $100
  assert.equal(krw, 137_310n);
  const back = convert(krw, "KRW", "USD", customerRate(rates, "KRW", "USD"));
  assert.ok(back < 10_000n && back >= 9_850n); // two spreads, about $99.00 back
  // Cross pair goes through USD
  assert.equal(midRate(rates, "EUR", "GBP").startsWith("0.8586"), true);
});

test("FX rate cleaning ignores junk and keeps the fallback", () => {
  const r = cleanRates({ KRW: 1400.5, EUR: -1, GBP: "x", JPY: Number.NaN });
  assert.equal(r.KRW, "1400.5");
  assert.equal(r.EUR, FALLBACK_USD_RATES.EUR);
  assert.equal(r.GBP, FALLBACK_USD_RATES.GBP);
  assert.equal(r.JPY, FALLBACK_USD_RATES.JPY);
  assert.equal(cleanRates(null).USD, "1");
});
