"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin";
import { runAdminAction, field, audit, failure } from "@/lib/actionHelpers";
import type { ActionState } from "@/lib/actionState";
import { DomainError } from "@/lib/ledger";
import { cleanReason } from "@/lib/adminRules";
import { approveLoan, rejectLoan } from "@/lib/loanService";
import { completeExternal, rejectExternal } from "@/lib/externalService";
import { adminSetCardStatus } from "@/lib/cardService";
import { markDormantAccounts } from "@/lib/walletService";
import { sendEmail } from "@/lib/email";
import { loanDecisionEmail, externalDecisionEmail } from "@/lib/emailTemplates";
import { formatMoney } from "@/lib/money";

const tag = (locale: string) => (locale === "ko" ? "ko-KR" : "en-US");

async function mailUser(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, locale: true } });
}

export async function loanDecisionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction(fd, async ({ admin }) => {
    const loanId = field(fd, "loanId");
    const decision = field(fd, "decision");
    const note = cleanReason(field(fd, "reason"));
    if (decision !== "approve" && decision !== "reject") throw new DomainError("invalidRequest");
    if (decision === "reject" && !note) throw new DomainError("reasonRequired");

    const owner =
      decision === "approve" ? await approveLoan(loanId, note) : await rejectLoan(loanId, note as string);
    await audit(admin.id, `admin.loan.${decision}`, loanId, { reason: note });
    const u = await mailUser(owner.userId);
    if (u) void sendEmail(u.email, loanDecisionEmail(u.locale, u.fullName, decision === "approve", note));
  });
}

export async function externalDecisionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction(fd, async ({ admin }) => {
    const id = field(fd, "transferId");
    const decision = field(fd, "decision");
    const note = cleanReason(field(fd, "reason"));
    if (decision !== "complete" && decision !== "reject") throw new DomainError("invalidRequest");
    if (decision === "reject" && !note) throw new DomainError("reasonRequired");

    const row = decision === "complete" ? await completeExternal(id) : await rejectExternal(id, note as string);
    await audit(admin.id, `admin.external.${decision}`, id, { reason: note });
    const u = await mailUser(row.userId);
    if (u) {
      const text = formatMoney(row.amountMinor, row.currency, tag(u.locale));
      void sendEmail(u.email, externalDecisionEmail(u.locale, u.fullName, decision === "complete", text, note));
    }
  });
}

export async function cardAdminAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction(fd, async ({ admin }) => {
    const cardId = field(fd, "cardId");
    const status = field(fd, "status");
    const reason = cleanReason(field(fd, "reason"));
    if (status !== "ACTIVE" && status !== "BLOCKED") throw new DomainError("invalidRequest");
    if (!reason) throw new DomainError("reasonRequired");
    await adminSetCardStatus(cardId, status, reason);
    await audit(admin.id, "admin.card.status", cardId, { status, reason });
  });
}

/** Marks wallets with 180+ days of no activity as dormant. */
export async function dormancyAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return { error: "forbidden" };
  try {
    const count = await markDormantAccounts();
    await audit(admin.id, "admin.dormancy.run", null, { count });
    revalidatePath("/", "layout");
    return { ok: true, info: String(count) };
  } catch (e) {
    return failure(e);
  }
}
