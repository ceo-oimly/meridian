// Pure signup rules shared by the form (client) and the server action. No dependencies.

export type Country = "US" | "KR";
export const COUNTRIES: readonly Country[] = ["US", "KR"];

export function isCountry(value: unknown): value is Country {
  return value === "US" || value === "KR";
}

/** 0 = too short, 1 = weak, 2 = fair, 3 = good, 4 = strong. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < 12) return 0;
  let score = 1;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  // Long runs of one repeated character are weak whatever else is in the password.
  if (/(.)\1{3,}/.test(password)) score = Math.min(score, 1);
  return Math.min(score, 4) as 1 | 2 | 3 | 4;
}

/** Strict YYYY-MM-DD parse. Returns null for impossible dates like 2001-02-30. */
function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

export function isValidBirthDate(value: string, today: Date): boolean {
  const dob = parseIsoDate(value);
  if (!dob) return false;
  const age = ageOn(dob, today);
  return age >= 0 && age <= 120;
}

export function isAdult(value: string, today: Date, minAge = 18): boolean {
  const dob = parseIsoDate(value);
  if (!dob) return false;
  return ageOn(dob, today) >= minAge;
}

function ageOn(dob: { y: number; m: number; d: number }, today: Date): number {
  let age = today.getUTCFullYear() - dob.y;
  const beforeBirthday =
    today.getUTCMonth() + 1 < dob.m ||
    (today.getUTCMonth() + 1 === dob.m && today.getUTCDate() < dob.d);
  if (beforeBirthday) age--;
  return age;
}

export function isValidPostalCode(country: Country, code: string): boolean {
  const value = code.trim();
  return country === "US" ? /^\d{5}(-\d{4})?$/.test(value) : /^\d{5}$/.test(value);
}

/**
 * Normalize a phone number to E.164 (e.g. +14155550132) or return null if invalid.
 * Accepts international ("+82 10-1234-5678") or national format for the chosen country.
 */
export function normalizePhone(country: Country, input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
  }
  if (!/^\d+$/.test(cleaned)) return null;

  if (country === "US") {
    const digits = cleaned.length === 11 && cleaned.startsWith("1") ? cleaned.slice(1) : cleaned;
    return /^[2-9]\d{9}$/.test(digits) ? `+1${digits}` : null;
  }
  // KR national numbers start with 0 and have 9-11 digits (010-xxxx-xxxx, 02-xxx-xxxx ...)
  if (/^0\d{8,10}$/.test(cleaned)) return `+82${cleaned.slice(1)}`;
  return null;
}

export const GENDERS = ["male", "female", "other", "undisclosed"] as const;
export type Gender = (typeof GENDERS)[number];

// Demo KYC: the user only picks a document TYPE. No document or ID number is ever collected.
export const KYC_DOCUMENT_TYPES = ["passport", "national_id", "bank_statement", "utility_bill"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

/**
 * Transaction PIN: 4-6 digits, rejecting all-same digits and straight runs (0000, 1234, 4321).
 * A short PIN is brute-forceable offline, so it is stored as an Argon2 hash and must be
 * protected by attempt limits wherever it is checked.
 */
export function isValidPin(pin: string): boolean {
  if (!/^\d{4,6}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  return !ascending && !descending;
}

/** Display name in the order people write it: Korean is family name first, no space. */
export function buildFullName(country: Country, firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  return country === "KR" ? `${last}${first}` : `${first} ${last}`;
}
