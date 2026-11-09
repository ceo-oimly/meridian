"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdmin } from "@/lib/admin";
import { parseAmount, MoneyError } from "@/lib/money";
import { checkAmount, ADMIN_ADJUST_MAX_MINOR } from "@/lib/limits";
import { cleanReason, isAdminStatus, canClose } from "@/lib/adminRules";
import { ledgerErrorKey } from "@/lib/ledger";
import { adminAdjust } from "@/lib/ledgerService";

export interface AdminState {
  ok?: boolean;
  // Key under "Admin.errors".
  error?: string;
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

function refresh() {
  revalidatePath("/[locale]/admin", "page");
  revalidatePath("/[locale]/dashboard", "page");
}

/** Credit or debit a customer's wallet. Admin only; the reason is mandatory and audited. */
export async function adjustAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  // Server actions are public endpoints, so the role is checked here, not just on the page.
  const admin = await getAdmin();
  if (!admin) return { error: "forbidden" };

  const accountId = field(formData, "accountId");
  const direction = field(formData, "direction");
  const key = field(formData, "idempotencyKey");
  if ((direction !== "credit" && direction !== "debit") || !KEY_RE.test(key)) {
    return { error: "invalidRequest" };
  }

  const reason = cleanReason(field(formData, "reason"));
  if (!reason) return { error: "reasonRequired" };

  const account = await db.account.findFirst({
    where: { id: accountId, kind: "CUSTOMER" },
    select: { currency: true, userId: true },
  });
  if (!account) return { error: "invalidRequest" };
  if (account.userId === admin.id) return { error: "selfAction" };

  let amountMinor: bigint;
  try {
    amountMinor = parseAmount(field(formData, "amount"), account.currency);
  } catch (e) {
    if (e instanceof MoneyError) return { error: "amountInvalid" };
    throw e;
  }
  const limit = checkAmount(amountMinor, account.currency, ADMIN_ADJUST_MAX_MINOR);
  if (limit === "notPositive") return { error: "amountInvalid" };
  if (limit === "overLimit") return { error: "overLimit" };

  try {
    const result = await adminAdjust({
      accountId,
      direction,
      amountMinor,
      reason,
      idempotencyKey: `${admin.id}:${key}`,
    });
    if (!result.replayed) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: "admin.adjust",
          targetId: accountId,
          metadata: {
            direction,
            currency: account.currency,
            amountMinor: amountMinor.toString(),
            reason,
            transactionId: result.id,
          },
          ip: await clientIp(),
        },
      });
    }
  } catch (e) {
    return { error: ledgerErrorKey(e) };
  }

  refresh();
  return { ok: true };
}

/** Change an account's status (active, frozen, suspended, dormant, closed). Admin only. */
export async function statusAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await getAdmin();
  if (!admin) return { error: "forbidden" };

  const accountId = field(formData, "accountId");
  const status = field(formData, "status");
  if (!isAdminStatus(status)) return { error: "invalidRequest" };

  const reason = cleanReason(field(formData, "reason"));
  if (!reason) return { error: "reasonRequired" };

  const account = await db.account.findFirst({
    where: { id: accountId, kind: "CUSTOMER" },
    select: { userId: true, status: true, balanceMinor: true },
  });
  if (!account) return { error: "invalidRequest" };
  if (account.userId === admin.id) return { error: "selfAction" };
  if (account.status === status) return { error: "noChange" };
  if (status === "CLOSED" && !canClose(account.balanceMinor)) return { error: "closeNeedsZero" };

  try {
    await db.$transaction([
      db.account.update({
        where: { id: accountId },
        data: { status, statusReason: status === "ACTIVE" ? null : reason },
      }),
      db.auditLog.create({
        data: {
          actorId: admin.id,
          action: "admin.status",
          targetId: accountId,
          metadata: { from: account.status, to: status, reason },
          ip: await clientIp(),
        },
      }),
    ]);
  } catch (e) {
    console.error("[admin] status change failed:", e);
    return { error: "transferFailed" };
  }

  refresh();
  return { ok: true };
}
