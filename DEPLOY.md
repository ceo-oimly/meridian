# Deploying Meridian Bank (demo) safely

This is a portfolio demo with fake money. Still, put it online the careful way.

## 1. Database
1. Create a free Postgres on **Neon** or **Supabase**. Copy the connection string (it must end with `?sslmode=require`).
2. From the `meridian-bank` folder: `npx prisma migrate deploy` (production) or `npx prisma migrate dev` (your computer).

## 2. Hosting (Vercel is the simplest)
1. Push the project to a **private** GitHub repository. Never commit `.env`.
2. Import it in Vercel. Add these Environment Variables: `DATABASE_URL`, `SESSION_SECRET`, and optionally `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_CRISP_WEBSITE_ID`, `CRON_SECRET`.
3. `postinstall` runs `prisma generate`, so the build works without extra steps.
4. Create your first admin: run `npm run make-admin -- you@example.com` on your computer with the production `DATABASE_URL` in `.env` (or edit `role` in Prisma Studio).

## 3. Custom domain and HTTPS
Buy a domain, add it in Vercel, and point the DNS records Vercel shows you. HTTPS is automatic and the app already sends an HSTS header. Turn on two-factor sign-in on your registrar, hosting and GitHub accounts: those are the real keys to the site.

## 4. Custom email
1. Create a Resend account and add your domain; add the DNS records (SPF, DKIM) it gives you.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain). Emails sent: welcome, money received, loan decision, bank transfer decision.

## 5. Live chat
Create a Crisp website, copy the **Website ID** into `NEXT_PUBLIC_CRISP_WEBSITE_ID`, redeploy. The bubble appears on every page.

## 6. Daily dormancy job
Set `CRON_SECRET`, then add a daily cron (Vercel Cron: path `/api/cron/dormancy`; Vercel sends the secret as a Bearer token). Wallets idle for 180 days become Dormant and reactivate when the customer signs in.

## 7. Security checklist
- Content-Security-Policy is **report-only** in production. Watch the browser console, then rename the header in `next.config.ts` to enforce it.
- Login and signup are rate limited in memory. On more than one server instance, move the limiter to Redis/Upstash.
- Add Cloudflare Turnstile to signup before it is public (the form has a honeypot only).
- Add an authenticator-app second factor (TOTP) before holding anything real. This demo never should.
- Keep the demo banner. Do not use a real bank's name, logo or wording.
