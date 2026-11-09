// Pure rules for admin actions. No dependencies, so they are easy to test.

export const ADMIN_STATUSES = ["ACTIVE", "FROZEN", "SUSPENDED", "DORMANT", "CLOSED"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export function isAdminStatus(value: string): value is AdminStatus {
  return (ADMIN_STATUSES as readonly string[]).includes(value);
}

/** A reason is mandatory for every admin action: 3-200 characters after tidying whitespace. */
export function cleanReason(input: string): string | null {
  const reason = input.trim().replace(/\s+/g, " ");
  return reason.length >= 3 && reason.length <= 200 ? reason : null;
}

/** An account can only be closed once it is empty, so no money disappears. */
export function canClose(balanceMinor: bigint): boolean {
  return balanceMinor === 0n;
}

import { DORMANT_AFTER_DAYS, isDormant } from "./dormancy.ts";
export { DORMANT_AFTER_DAYS };

/** True when an account has had no activity for the dormancy period (180 days or more). */
export function isInactive(lastActivityAt: Date, now: Date, days: number = DORMANT_AFTER_DAYS): boolean {
  return isDormant(lastActivityAt, now, days);
}
