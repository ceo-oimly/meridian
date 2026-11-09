# Meridian Bank: feature checklist

The original wish list, checked honestly against the code. Fictional bank, fake money.

**Important:** the logic modules have unit tests (`npm test`). The pages, forms and database code were written
without being able to run them in the build environment, so treat this version as "needs your first run":
sign up, click through each page, and report anything that errors.

Legend: BUILT = code exists and is wired up. NEEDS KEYS = works only after you add an account/key. LIMIT = built, with the limit noted.

| # | Original request | Status | How it works here |
|---|---|---|---|
| 1 | Add/remove any amount (credit/debit) | BUILT | Admin only. Balanced ledger entries, required reason, audit log. |
| 2 | Transaction history | BUILT | Latest 20 entries on the dashboard, plus a CSV statement per wallet (`/api/statement`). LIMIT: no separate full-history page yet. |
| 3 | Any country's currency | LIMIT | 8 currencies: USD, EUR, GBP, JPY, KRW, NGN, CAD, AUD. Add more in `money.ts` and the `Currency` enum. |
| 4 | Block / suspend / dormant account | BUILT | Admin sets Active/Frozen/Suspended/Dormant/Closed. Daily job or admin button marks 180-day idle wallets Dormant; signing in reactivates automatic ones. |
| 5 | Bank transfers | BUILT | Internal transfers (PIN) and simulated outside-bank transfers: fee, Processing status, admin completes or rejects with refund. |
| 6 | Crypto | LIMIT | Paper trading of BTC, ETH, SOL, XRP from the USD wallet. Live prices when CoinGecko is reachable, otherwise demo prices. No real crypto. |
| 7 | Send and receive | BUILT | Send by account number. Request money by email; the other customer pays (PIN) or declines. |
| 8 | Loans | BUILT | Apply, admin approves (paid into wallet) or rejects, repayment schedule, pay instalments with PIN. |
| 9 | Cards | LIMIT | Fictional virtual cards (numbers start with 9, only last 4 digits stored), freeze, limits, simulated purchases, admin block. Not a real card network. |
| 10 | "Lots more" | BUILT | Currency conversion with live rate and 0.5% spread, multi-wallet, PIN lockout, audit log, idempotent postings, rate limiting on login/signup. |
| 11 | Custom email | NEEDS KEYS | Welcome, money received, loan decision, bank transfer decision. Needs a domain and `RESEND_API_KEY`. Without them emails print in the terminal. |
| 12 | Live chat | NEEDS KEYS | Crisp widget loads when `NEXT_PUBLIC_CRISP_WEBSITE_ID` is set. |
| 13 | Secure domain and hosting | NEEDS KEYS | Security headers, Argon2, hashed sessions, role checks, report-only CSP are in code. Domain and hosting steps are in `DEPLOY.md`. Not deployed yet. |
| 14 | Premium design / tested and trusted | LIMIT | Unit tests cover money, ledger, limits, FX, loans, crypto maths, cards, CSV. No browser (end-to-end) tests and no external security review yet. |
| 15 | Auto change language | BUILT | English and Korean from the browser language, with a manual switcher. |

## Still open
- Browser end-to-end tests (Playwright) and a security review.
- Authenticator-app two-factor sign-in, Cloudflare Turnstile on signup.
- A full paginated history page; more languages; more currencies.
- Real card-network and bank integrations need licensed partners and are out of scope for a demo.
