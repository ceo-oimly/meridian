import { randomInt } from "node:crypto";

/** 10-digit account number; first digit is never 0. Uniqueness is enforced by the DB (retry on conflict). */
export function generateAccountNumber(): string {
  let out = String(randomInt(1, 10));
  for (let i = 0; i < 9; i++) out += String(randomInt(0, 10));
  return out;
}
