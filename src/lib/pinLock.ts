// PIN attempt limiting. A 4-6 digit PIN is only safe if guesses are rate limited.

export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

export function isPinLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** State to store after a wrong PIN. The 5th consecutive miss locks for 15 minutes and resets the counter. */
export function afterPinFailure(
  failedAttempts: number,
  now: Date,
): { failedAttempts: number; lockedUntil: Date | null } {
  const next = failedAttempts + 1;
  if (next >= MAX_PIN_ATTEMPTS) {
    return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) };
  }
  return { failedAttempts: next, lockedUntil: null };
}

export function attemptsLeft(failedAttempts: number): number {
  return Math.max(MAX_PIN_ATTEMPTS - failedAttempts, 0);
}
