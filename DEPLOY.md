# Deploying Meridian Bank

Production deployment instructions and checklist for Meridian Bank.

## 1. Database
1. Provision a PostgreSQL instance (e.g. Neon, Supabase, AWS RDS). Ensure connection pooling and SSL mode (`?sslmode=require`).
2. From the `meridian-bank` folder: `npx prisma db push` or `npx prisma migrate deploy`.

## 2. Hosting (Vercel / Cloud)
1. Push the project to a **private** repository. Never commit `.env`.
2. Configure Environment Variables: `DATABASE_URL`, `SESSION_SECRET`, and optionally `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_CRISP_WEBSITE_ID`, `CRON_SECRET`.
3. `postinstall` runs `prisma generate`, so the build works without extra steps.
4. Create your first admin: run `npm run make-admin -- you@example.com` with the production `DATABASE_URL` in `.env` (or update `role` in Prisma Studio).

## 3. Custom domain and HTTPS
Configure your domain DNS to point to the host. HTTPS is automatic and the app enforces an HSTS header. Ensure two-factor authentication is active on all provider accounts.

## 4. Custom email
1. Create a Resend account and add your domain; configure DNS records (SPF, DKIM).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain). Automated emails: welcome, money received, loan decisions, and bank transfer notifications.

## 5. Live chat
Set `NEXT_PUBLIC_CRISP_WEBSITE_ID` to activate the Crisp customer chat widget.

## 6. Daily dormancy job
Set `CRON_SECRET`, then configure a daily cron schedule to call `/api/cron/dormancy` with `Authorization: Bearer <CRON_SECRET>`. Wallets inactive for 180 days transition to Dormant status.

## 7. Security checklist
- Review Content-Security-Policy header in `next.config.ts` and enforce as required.
- Rate limiting is in-memory by default; connect to Redis/Upstash for multi-instance deployments.
- Ensure strict environment secret hygiene in production.
