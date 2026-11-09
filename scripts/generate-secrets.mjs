// Usage: node scripts/generate-secrets.mjs
// Generates secure cryptographic random secrets for production deployment.
import crypto from "node:crypto";

const sessionSecret = crypto.randomBytes(32).toString("base64");
const cronSecret = crypto.randomBytes(32).toString("hex");

console.log("=== Generated Production Secrets ===");
console.log(`SESSION_SECRET="${sessionSecret}"`);
console.log(`CRON_SECRET="${cronSecret}"`);
console.log("====================================");
console.log("Add these to your production environment variables (e.g. in Vercel / Railway / Docker).");

