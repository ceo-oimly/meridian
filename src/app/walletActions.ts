"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { parseAmount, MoneyError } from "@/lib/money";
import { checkAmount, TRANSFER_MAX_MINOR } from "@/lib/limits";
import { isPinLocked, afterPinFailure, attemptsLeft } from "@/lib/pinLock";
import { ledgerErrorKey } from "@/lib/ledger";
import { transfer } from "@/lib/ledgerService";
import { sendEmail } from "@/lib/email";
import { moneyReceivedEmail } from "@/lib/emailTemplates";
import { formatMoney } from "@/lib/money";

export interface WalletState {
  ok?: boolean;
  // Key under "Wallet.errors".
  error?: string;
  // Used by the PIN-wrong message ("{count} attempts left").
  attemptsLeft?: number;
}

const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function transferAction(_prev: WalletState, formData: FormData): Promise<WalletState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const now = new Date();
  if (!user.pinHash) return { error: "pinNotSet" };
  if (isPinLocked(user.pinLockedUntil, now)) return { error: "pinLocked" };

  // Check the PIN first, so a stranger on an open session can't probe other fields for free.
  const pinOk = await verifyPassword(user.pinHash, field(formData, "pin"));
  if (!pinOk) {
    const next = afterPinFailure(user.pinFailedAttempts, now);
    await db.user.update({
      where: { id: user.id },
      data: { pinFailedAttempts: next.failedAttempts, pinLockedUntil: next.lockedUntil },
    });
    await db.auditLog.create({
      data: { actorId: user.id, action: "wallet.pin.failed", ip: await clientIp() },
    });
    if (next.lockedUntil) return { error: "pinLocked" };
    return { error: "pinWrong", attemptsLeft: attemptsLeft(next.failedAttempts) };
  }
  if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
  }

  const fromAccountId = field(formData, "fromAccountId");
  const toAccountNumber = field(formData, "toAccountNumber").replace(/\s|-/g, "");
  const memo = field(formData, "memo").slice(0, 100);
  const key = field(formData, "idempotencyKey");
  if (!KEY_RE.test(key)) return { error: "transferFailed" };
  if (!/^[1-9]\d{9}$/.test(toAccountNumber)) return { error: "recipientInvalid" };

  const from = await db.account.findFirst({
    where: { id: fromAccountId, userId: user.id, kind: "CUSTOMER" },
    select: { currency: true },
  });
  if (!from) return { error: "transferFailed" };

  let amountMinor: bigint;
  try {
    amountMinor = parseAmount(field(formData, "amount"), from.currency);
  } catch (e) {
    if (e instanceof MoneyError) return { error: "amountInvalid" };
    throw e;
  }
  const limit = checkAmount(amountMinor, from.currency, TRANSFER_MAX_MINOR);
  if (limit === "notPositive") return { error: "amountInvalid" };
  if (limit === "overLimit") return { error: "overLimit" };

  try {
    const result = await transfer({
      userId: user.id,
      fromAccountId,
      toAccountNumber,
      amountMinor,
      memo: memo || null,
      idempotencyKey: `${user.id}:${key}`,
    });
    if ("failure" in result) return { error: result.failure };

    if (!result.replayed) {
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: "wallet.transfer",
          targetId: result.id,
          metadata: { currency: from.currency, amountMinor: amountMinor.toString() },
          ip: await clientIp(),
        },
      });
      const recipient = await db.user.findFirst({
        where: { accounts: { some: { accountNumber: toAccountNumber, kind: "CUSTOMER" } } },
        select: { email: true, fullName: true, locale: true },
      });
      if (recipient) {
        const text = formatMoney(amountMinor, from.currency, recipient.locale === "ko" ? "ko-KR" : "en-US");
        void sendEmail(recipient.email, moneyReceivedEmail(recipient.locale, recipient.fullName, text, user.fullName));
      }
    }
  } catch (e) {
    return { error: ledgerErrorKey(e) };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
