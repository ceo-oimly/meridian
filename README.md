# Meridian Bank (demo)

A fictional multi-currency digital bank built as a portfolio project. **All money is fake.**
Supports US (USD, English) and Korea (KRW, 한국어) from day one.

## What is in it

Wallets in 8 currencies, PIN-protected transfers, currency conversion, virtual cards, loans, payment requests,
simulated outside-bank transfers, paper-trading crypto, CSV statements, admin tools (balances, status, approvals,
dormancy), English/Korean, email and live-chat hooks. See `ROADMAP.md` for the honest status of each feature and
`DEPLOY.md` for going online.

## Run it

```bash
npm install
cp .env.example .env        # set DATABASE_URL and SESSION_SECRET
npx prisma migrate dev --name init
npm run dev                 # http://localhost:3000
npm test                    # money + ledger unit tests
npm run typecheck
```

A free Postgres from Neon or Supabase works for `DATABASE_URL`.

**Updating an existing database:** after replacing the files, from inside the `meridian-bank` folder run
`npm install` and then `npx prisma migrate dev --name phase4_features`. It adds currencies, cards, loans, requests,
bank transfers and crypto tables.

## Signup (5 steps)

Personal, Contact, Next of kin, Account (currency, password, PIN), Verification. It is validated on the
client per step and again on the server. The first wallet (in the chosen currency) is created at signup.

**Data minimisation by design:** this is a demo, so the Verification step is a simulated KYC. Only the
document *type* is stored; no ID/passport uploads and no SSN/tax ID are collected. Bot protection is a
honeypot field; add Cloudflare Turnstile or reCAPTCHA (needs site keys) before any public launch.
The PIN is stored as an Argon2 hash and needs attempt limiting wherever it is verified.

## Design rules (the interesting parts)

1. **Money is integer minor units (BigInt).** USD has 2 decimals, KRW has 0. No floats anywhere.
2. **Balances only change through the ledger.** Each transaction has 2+ entries that sum to zero per currency (`assertBalanced`).
3. **Append-only.** Corrections are reversing transactions, never edits.
4. **Idempotency keys** on every transaction so retries can't double-post.
5. **Account states** (ACTIVE, FROZEN, SUSPENDED, DORMANT, CLOSED) are enforced in the posting rules.
6. **Cross-currency FX** posts through system FX accounts so each currency still balances on its own.
7. **Security:** Argon2id, hashed session tokens, constant-time-ish login, strict headers, audit log.

## Admin

Customers can only view their wallets, send money (PIN protected) and see history. These are **admin-only**:

- Credit or debit a wallet (posted as a balanced ledger transaction against a house account, with a required reason)
- Change account status: Active, Frozen, Suspended, Dormant, Closed (closing needs a zero balance)

Every admin action is role-checked on the server, needs a reason, and is written to the audit log.
Admins cannot change their own account. Open `/en/admin` (or `/ko/admin`) while signed in as an admin.

Make the first admin (sign up normally first, then from the `meridian-bank` folder):

```bash
npx prisma migrate dev --name admin_role
npm run make-admin -- you@example.com
```

Or open `npx prisma studio`, go to the User table, and change `role` to `ADMIN`.

More admin tools: `/en/admin/requests` shows loan applications, bank transfers in progress and all cards (approve, reject
with refund, block), and a button that marks 180-day idle wallets as Dormant.
