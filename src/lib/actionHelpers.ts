import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getCurrentUser } from "./session";
import { getAdmin } from "./admin";
import { verifyPassword } from "./password";
import { isPinLocked, afterPinFailure, attemptsLeft } from "./pinLock";
import { parseAmount, MoneyError, type CurrencyCode } from "./money";
import { checkAmount } from "./limits";
import { DomainError, LedgerError, ledgerErrorKey } from "./ledger";
import type { ActionState } from "./actionState";

export const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function audit(
  actorId: string | null,
  action: string,
  targetId: string | null,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await db.auditLog.create({ data: { actorId, action, targetId, metadata: metadata ?? undefined, ip: await clientIp() } });
}

/** Turn any thrown error into a translation key. Unexpected errors are logged so they can be debugged. */
export function failure(e: unknown): ActionState {
  if (!(e instanceof DomainError) && !(e instanceof LedgerError)) console.error("[action] unexpected error:", e);
  return { error: ledgerErrorKey(e) };
}

/** Checks the transaction PIN with the same lockout rules as transfers. Returns an error state, or null when OK. */
export async function checkPin(user: SessionUser, fd: FormData): Promise<ActionState | null> {
  const now = new Date();
  if (!user.pinHash) return { error: "pinNotSet" };
  if (isPinLocked(user.pinLockedUntil, now)) return { error: "pinLocked" };

  const ok = await verifyPassword(user.pinHash, field(fd, "pin"));
  if (!ok) {
    const next = afterPinFailure(user.pinFailedAttempts, now);
    await db.user.update({
      where: { id: user.id },
      data: { pinFailedAttempts: next.failedAttempts, pinLockedUntil: next.lockedUntil },
    });
    await audit(user.id, "wallet.pin.failed", null);
    if (next.lockedUntil) return { error: "pinLocked" };
    return { error: "pinWrong", attemptsLeft: attemptsLeft(next.failedAttempts) };
  }
  if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
  }
  return null;
}

/** Parse and range-check an amount field. */
export function readAmount(
  fd: FormData,
  name: string,
  currency: CurrencyCode,
  limits: Record<CurrencyCode, bigint>,
): { amount: bigint } | { error: string } {
  let amount: bigint;
  try {
    amount = parseAmount(field(fd, name), currency);
  } catch (e) {
    if (e instanceof MoneyError) return { error: "amountInvalid" };
    throw e;
  }
  const check = checkAmount(amount, currency, limits);
  if (check === "notPositive") return { error: "amountInvalid" };
  if (check === "overLimit") return { error: "overLimit" };
  return { amount };
}

interface RunContext {
  user: SessionUser;
  fd: FormData;
  /** Idempotency key namespaced to this user. */
  key: string;
}

/**
 * Wrapper for customer actions: sign-in check, optional PIN, idempotency key, error mapping, page refresh.
 * `fn` returns extra state (like `info`) or nothing; throwing DomainError/LedgerError becomes an error key.
 */
export async function runUserAction(
  fd: FormData,
  opts: { pin?: boolean },
  fn: (ctx: RunContext) => Promise<Partial<ActionState> | void>,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  if (opts.pin) {
    const pinError = await checkPin(user, fd);
    if (pinError) return pinError;
  }
  const raw = field(fd, "idempotencyKey");
  if (!KEY_RE.test(raw)) return { error: "transferFailed" };

  try {
    const extra = await fn({ user, fd, key: `${user.id}:${raw}` });
    revalidatePath("/", "layout");
    return { ok: true, ...(extra ?? {}) };
  } catch (e) {
    return failure(e);
  }
}

/** Same idea for admin actions: the role is checked here on every call. */
export async function runAdminAction(
  fd: FormData,
  fn: (ctx: { admin: SessionUser; fd: FormData }) => Promise<void>,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return { error: "forbidden" };
  try {
    await fn({ admin, fd });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
