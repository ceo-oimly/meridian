# Meridian Bank

Modern multi-currency digital banking platform with double-entry accounting.
Supports US (USD, English) and Korea (KRW, 한국어) out of the box.

## Core Features

Wallets in 8 currencies, PIN-protected transfers, instant currency conversion, virtual cards, loans, payment requests,
external bank transfers, digital assets trading, CSV statements, comprehensive admin portal (balances, status, approvals,
dormancy), English/Korean i18n, email notifications and live-chat integrations.

## Run it

```bash
npm install
cp .env.example .env        # configure DATABASE_URL and SESSION_SECRET
npx prisma generate
npx prisma db push          # or npx prisma migrate deploy
npm run dev                 # http://localhost:3000
npm test                    # unit tests
npm run typecheck
```

## Signup & KYC (5 steps)

Personal, Contact, Next of kin, Account (currency, password, PIN), Verification.
Validated client-side per step and strictly re-validated on the server. The first wallet (in the chosen currency) is created upon account verification.
The PIN is stored as an Argon2 hash and protected by attempt limits.

## Architecture & Financial Invariants

1. **Money is integer minor units (BigInt).** USD has 2 decimals, KRW has 0. No floats anywhere.
2. **Double-entry ledger.** Each transaction has 2+ balanced entries that sum to zero per currency (`assertBalanced`).
3. **Append-only.** Corrections are reversing transactions, never raw edits.
4. **Idempotency keys** on every financial transaction preventing duplicate postings.
5. **Account states** (ACTIVE, FROZEN, SUSPENDED, DORMANT, CLOSED) strictly enforced by posting rules.
6. **Cross-currency FX** posts through system FX accounts so each currency balances independently.
7. **Security:** Argon2id hashing, encrypted session tokens, timing-attack protection, strict CSP/security headers, full audit log.

## Administration

Administrative controls:

- Credit or debit a wallet (posted as a balanced ledger transaction against a house account, with a mandatory audit reason)
- Change account status: Active, Frozen, Suspended, Dormant, Closed
- Manage approval queues: loan applications, external bank transfers, virtual card blocking, inactivity dormancy checks

To promote the first administrator:
```bash
npm run make-admin -- you@example.com
```
