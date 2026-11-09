// Loan maths in integer arithmetic (BigInt fixed point). No floats anywhere.

export const LOAN_TERMS = [3, 6, 12, 24, 36] as const;
export type LoanTerm = (typeof LOAN_TERMS)[number];

export function isLoanTerm(value: number): value is LoanTerm {
  return (LOAN_TERMS as readonly number[]).includes(value);
}

/** Annual interest rate in basis points (1100 = 11.00%). Longer loans cost more. */
export function aprBpsForTerm(months: number): number {
  if (months <= 6) return 900;
  if (months <= 12) return 1100;
  if (months <= 24) return 1300;
  return 1500;
}

const SCALE = 10n ** 12n;

function monthlyRateScaled(aprBps: number): bigint {
  return (BigInt(aprBps) * SCALE) / (10_000n * 12n);
}

/** Level monthly payment, rounded half up to a minor unit. */
export function monthlyPayment(principal: bigint, aprBps: number, months: number): bigint {
  if (principal <= 0n) throw new Error("Principal must be positive");
  if (!Number.isInteger(months) || months <= 0) throw new Error("Term must be positive");
  const n = BigInt(months);
  if (aprBps === 0) return (principal + n - 1n) / n;

  const r = monthlyRateScaled(aprBps);
  let growth = SCALE; // (1 + r)^months
  for (let i = 0; i < months; i++) growth = (growth * (SCALE + r)) / SCALE;

  const numerator = principal * r * growth;
  const denominator = (growth - SCALE) * SCALE;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Same day next month; clamps to the last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()),
  );
}

export interface ScheduledInstallment {
  number: number;
  dueDate: Date;
  amountMinor: bigint;
  principalMinor: bigint;
  interestMinor: bigint;
}

/** Full repayment schedule. The last instalment absorbs rounding so the balance ends at exactly zero. */
export function buildSchedule(
  principal: bigint,
  aprBps: number,
  months: number,
  start: Date,
): ScheduledInstallment[] {
  const payment = monthlyPayment(principal, aprBps, months);
  const r = monthlyRateScaled(aprBps);
  let balance = principal;
  const out: ScheduledInstallment[] = [];

  for (let n = 1; n <= months; n++) {
    const interest = (balance * r * 2n + SCALE) / (SCALE * 2n);
    let principalPart = payment - interest;
    if (principalPart < 0n) principalPart = 0n;
    if (n === months || principalPart > balance) principalPart = balance;
    balance -= principalPart;
    out.push({
      number: n,
      dueDate: addMonths(start, n),
      amountMinor: principalPart + interest,
      principalMinor: principalPart,
      interestMinor: interest,
    });
  }
  return out;
}
