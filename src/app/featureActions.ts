"use server";

import { db } from "@/lib/db";
import { runUserAction, field, audit, readAmount } from "@/lib/actionHelpers";
import type { ActionState } from "@/lib/actionState";
import { DomainError } from "@/lib/ledger";
import { isCurrency, parseAmount, formatMoney, MoneyError } from "@/lib/money";
import { TRANSFER_MAX_MINOR, LOAN_MAX_MINOR, CRYPTO_TRADE_MAX_USD_MINOR, checkAmount } from "@/lib/limits";
import { openWallet, convertCurrency } from "@/lib/walletService";
import { createCard, setCardStatusByUser, cardPurchase } from "@/lib/cardService";
import { formatCardNumber } from "@/lib/cards";
import { applyForLoan, repayNextInstallment } from "@/lib/loanService";
import { createPaymentRequest, payRequest, closeRequest } from "@/lib/requestService";
import { createExternalTransfer } from "@/lib/externalService";
import { isKnownBank, isValidExternalAccount } from "@/lib/externalRules";
import { buyCrypto, sellCrypto } from "@/lib/cryptoService";
import { isCryptoSymbol, parseUnits } from "@/lib/cryptoMath";
import { sendEmail } from "@/lib/email";
import { moneyReceivedEmail } from "@/lib/emailTemplates";

async function ownWallet(userId: string, accountId: string) {
  const a = await db.account.findFirst({
    where: { id: accountId, userId, kind: "CUSTOMER" },
    select: { id: true, currency: true },
  });
  if (!a) throw new DomainError("transferFailed");
  return a;
}

export async function openWalletAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user }) => {
    const currency = field(fd, "currency");
    if (!isCurrency(currency)) throw new DomainError("transferFailed");
    const w = await openWallet(user.id, currency);
    await audit(user.id, "wallet.open", w.id, { currency });
  });
}

export async function convertAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const from = await ownWallet(user.id, field(fd, "fromAccountId"));
    const toCurrency = field(fd, "toCurrency");
    if (!isCurrency(toCurrency)) throw new DomainError("transferFailed");
    const amt = readAmount(fd, "amount", from.currency, TRANSFER_MAX_MINOR);
    if ("error" in amt) throw new DomainError(amt.error);
    const r = await convertCurrency({
      userId: user.id,
      fromAccountId: from.id,
      toCurrency,
      amountMinor: amt.amount,
      idempotencyKey: key,
    });
    if (!r.replayed) {
      await audit(user.id, "wallet.convert", r.id, { from: from.currency, to: toCurrency, amountMinor: amt.amount.toString() });
    }
  });
}

/* ---------- Cards ---------- */

export async function createCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user }) => {
    const wallet = await ownWallet(user.id, field(fd, "accountId"));
    const card = await createCard(user.id, wallet.id, user.fullName);
    await audit(user.id, "card.create", card.id);
    const yy = String(card.expYear).slice(-2);
    // Shown once. Only the last 4 digits are stored.
    return { info: `${formatCardNumber(card.number)}  ·  ${String(card.expMonth).padStart(2, "0")}/${yy}  ·  CVV ${card.cvv}` };
  });
}

export async function cardStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user }) => {
    const status = field(fd, "status");
    if (status !== "ACTIVE" && status !== "FROZEN") throw new DomainError("transferFailed");
    await setCardStatusByUser(user.id, field(fd, "cardId"), status);
    await audit(user.id, "card.status", field(fd, "cardId"), { status });
  });
}

export async function cardPurchaseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user, key }) => {
    const card = await db.card.findFirst({
      where: { id: field(fd, "cardId"), userId: user.id },
      select: { id: true, account: { select: { currency: true } } },
    });
    if (!card) throw new DomainError("transferFailed");
    const merchant = field(fd, "merchant").slice(0, 60);
    if (merchant.length < 2) throw new DomainError("merchantRequired");
    const amt = readAmount(fd, "amount", card.account.currency, TRANSFER_MAX_MINOR);
    if ("error" in amt) throw new DomainError(amt.error);
    const r = await cardPurchase({ userId: user.id, cardId: card.id, merchant, amountMinor: amt.amount, idempotencyKey: key });
    if (!r.replayed) await audit(user.id, "card.purchase", r.id, { amountMinor: amt.amount.toString() });
  });
}

/* ---------- Loans ---------- */

export async function loanApplyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user }) => {
    const wallet = await ownWallet(user.id, field(fd, "accountId"));
    const amt = readAmount(fd, "amount", wallet.currency, LOAN_MAX_MINOR);
    if ("error" in amt) throw new DomainError(amt.error);
    const purpose = field(fd, "purpose").slice(0, 120);
    if (purpose.length < 3) throw new DomainError("purposeRequired");
    const loan = await applyForLoan({
      userId: user.id,
      accountId: wallet.id,
      principalMinor: amt.amount,
      termMonths: Number(field(fd, "termMonths")),
      purpose,
    });
    await audit(user.id, "loan.apply", loan.id, { amountMinor: amt.amount.toString() });
  });
}

export async function loanRepayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const r = await repayNextInstallment({ userId: user.id, loanId: field(fd, "loanId"), idempotencyKey: key });
    if (!r.replayed) await audit(user.id, "loan.repay", r.id);
  });
}

/* ---------- Payment requests ---------- */

export async function requestCreateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user }) => {
    const wallet = await ownWallet(user.id, field(fd, "accountId"));
    const email = field(fd, "payerEmail").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("payerNotFound");
    const amt = readAmount(fd, "amount", wallet.currency, TRANSFER_MAX_MINOR);
    if ("error" in amt) throw new DomainError(amt.error);
    const r = await createPaymentRequest({
      requesterId: user.id,
      toAccountId: wallet.id,
      payerEmail: email,
      amountMinor: amt.amount,
      note: field(fd, "note").slice(0, 100) || null,
    });
    await audit(user.id, "request.create", r.id);
  });
}

export async function requestPayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const requestId = field(fd, "requestId");
    const r = await payRequest({ userId: user.id, requestId, idempotencyKey: key });
    if (!r.replayed) {
      await audit(user.id, "request.pay", requestId);
      const req = await db.paymentRequest.findUnique({
        where: { id: requestId },
        include: { requester: { select: { email: true, fullName: true, locale: true } } },
      });
      if (req) {
        const text = formatMoney(req.amountMinor, req.currency, req.requester.locale === "ko" ? "ko-KR" : "en-US");
        void sendEmail(req.requester.email, moneyReceivedEmail(req.requester.locale, req.requester.fullName, text, user.fullName));
      }
    }
  });
}

export async function requestDeclineAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user }) => {
    await closeRequest(user.id, field(fd, "requestId"), "payer");
  });
}

export async function requestCancelAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, {}, async ({ user }) => {
    await closeRequest(user.id, field(fd, "requestId"), "requester");
  });
}

/* ---------- Outside bank transfer (simulated) ---------- */

export async function externalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const wallet = await ownWallet(user.id, field(fd, "accountId"));
    const bank = field(fd, "bank");
    const recipientAccount = field(fd, "recipientAccount").replace(/\s|-/g, "");
    const recipientName = field(fd, "recipientName").replace(/\s+/g, " ").slice(0, 60);
    if (!isKnownBank(bank)) throw new DomainError("bankInvalid");
    if (!isValidExternalAccount(recipientAccount)) throw new DomainError("externalAccountInvalid");
    if (recipientName.length < 2) throw new DomainError("recipientNameRequired");
    const amt = readAmount(fd, "amount", wallet.currency, TRANSFER_MAX_MINOR);
    if ("error" in amt) throw new DomainError(amt.error);
    const r = await createExternalTransfer({
      userId: user.id,
      accountId: wallet.id,
      bank,
      recipientName,
      recipientAccount,
      amountMinor: amt.amount,
      idempotencyKey: key,
    });
    if (!r.replayed) await audit(user.id, "external.create", r.id, { amountMinor: amt.amount.toString(), bank });
  });
}

/* ---------- Paper-trading crypto ---------- */

export async function cryptoBuyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const symbol = field(fd, "symbol");
    if (!isCryptoSymbol(symbol)) throw new DomainError("transferFailed");
    let usd: bigint;
    try {
      usd = parseAmount(field(fd, "amount"), "USD");
    } catch (e) {
      if (e instanceof MoneyError) throw new DomainError("amountInvalid");
      throw e;
    }
    const limit = checkAmount(usd, "USD", { ...TRANSFER_MAX_MINOR, USD: CRYPTO_TRADE_MAX_USD_MINOR });
    if (limit === "notPositive") throw new DomainError("amountInvalid");
    if (limit === "overLimit") throw new DomainError("overLimit");
    const r = await buyCrypto({ userId: user.id, symbol, usdMinor: usd, idempotencyKey: key });
    if (!r.replayed) await audit(user.id, "crypto.buy", r.id, { symbol, usdMinor: usd.toString() });
  });
}

export async function cryptoSellAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runUserAction(fd, { pin: true }, async ({ user, key }) => {
    const symbol = field(fd, "symbol");
    if (!isCryptoSymbol(symbol)) throw new DomainError("transferFailed");
    const units = parseUnits(field(fd, "quantity"));
    if (!units) throw new DomainError("amountInvalid");
    const r = await sellCrypto({ userId: user.id, symbol, units, idempotencyKey: key });
    if (!r.replayed) await audit(user.id, "crypto.sell", r.id, { symbol, units: units.toString() });
  });
}
