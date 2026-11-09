# Meridian Bank: Architecture & Implementation Status

Implementation status and production roadmap for Meridian Bank features.

Legend: BUILT = fully implemented and wired up. INTEGRATION REQUIRED = core ledger logic implemented; requires external service provider / partner keys for live processing.

| # | Feature | Status | Implementation Details |
|---|---|---|---|
| 1 | Add/remove any amount (credit/debit) | BUILT | Admin only. Balanced ledger entries, mandatory audit reason, audit log. |
| 2 | Transaction history | BUILT | Real-time entry feed on the dashboard, plus CSV statement download per wallet (`/api/statement`). |
| 3 | Multi-currency support | BUILT | 8 supported currencies: USD, EUR, GBP, JPY, KRW, NGN, CAD, AUD with integer minor unit precision. |
| 4 | Account lifecycle management | BUILT | Status management: Active, Frozen, Suspended, Dormant, Closed. Automated 180-day inactivity job. |
| 5 | Bank transfers | BUILT | Internal transfers (PIN-protected, idempotent) and external bank transfer approval flow. |
| 6 | Digital assets | BUILT | Asset trading of BTC, ETH, SOL, XRP from USD wallet. Live market pricing via CoinGecko with fallback pricing. |
| 7 | Peer-to-peer transfers & requests | BUILT | Direct transfer by account number. Payment requests by email with approve/decline flows. |
| 8 | Lending & amortisation | BUILT | Loan application, administrator approval queue, amortisation schedule generation, instalment repayments. |
| 9 | Virtual cards | BUILT | Card issuing, Luhn generation, per-transaction and monthly limit controls, freeze/unfreeze, merchant authorizations. |
| 10 | FX exchange | BUILT | Multi-wallet conversion with live FX rates and configured spread margins. |
| 11 | Transactional email | INTEGRATION REQUIRED | Welcome, transfer receipts, and decision notices. Integrated with Resend (falls back to console log). |
| 12 | Live chat | INTEGRATION REQUIRED | Crisp widget integration via `NEXT_PUBLIC_CRISP_WEBSITE_ID`. |
| 13 | Security & compliance | BUILT | Argon2id hashing, timing attack mitigation, CSP, strict transport security headers, and append-only audit trail. |
| 14 | Automated testing | BUILT | Comprehensive test suite covering money maths, ledger invariants, limits, FX, loans, cards, and CSV generation. |
| 15 | Internationalization | BUILT | Multi-locale routing for English and Korean with automatic locale detection and switcher. |

## Production Enhancements
- Playwright end-to-end integration test suite.
- Authenticator app (TOTP) two-factor authentication.
- Cloudflare Turnstile on public signup.
- Direct card network issuing provider integration (e.g. Stripe Issuing, Marqeta).
