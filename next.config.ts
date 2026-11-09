import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Report-only: the browser logs violations but blocks nothing. Once the console stays clean in production,
// rename the header to "Content-Security-Policy" to enforce it. Next.js needs inline scripts/styles.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://client.crisp.chat https://settings.crisp.chat",
  "style-src 'self' 'unsafe-inline' https://client.crisp.chat https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://client.crisp.chat",
  "img-src 'self' data: https://*.crisp.chat",
  "connect-src 'self' https://*.crisp.chat wss://*.crisp.chat",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(__dirname),
  async headers() {
    const headers =
      process.env.NODE_ENV === "production"
        ? [...securityHeaders, { key: "Content-Security-Policy-Report-Only", value: csp }]
        : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

export default withNextIntl(nextConfig);
