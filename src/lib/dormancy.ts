export const DORMANT_AFTER_DAYS = 180;

export function dormantCutoff(now: Date, days: number = DORMANT_AFTER_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isDormant(lastActivityAt: Date, now: Date, days: number = DORMANT_AFTER_DAYS): boolean {
  return lastActivityAt.getTime() <= dormantCutoff(now, days).getTime();
}
