// Usage:
// 1. Promote an existing user:
//    node --env-file=.env scripts/create-admin.mjs someone@example.com
// 2. Or create a brand new admin user:
//    node --env-file=.env scripts/create-admin.mjs admin@example.com "MySecurePassword123!" "Admin Name" "1234"
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

function generateAccountNumber() {
  const first = Math.floor(1 + Math.random() * 9);
  const rest = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
  return `${first}${rest}`;
}

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
const fullName = process.argv[4] || "Administrator";
const pin = process.argv[5] || "123456";

if (!email) {
  console.log("------------------------------------------------------------------");
  console.log("Usage: node --env-file=.env scripts/create-admin.mjs <email> [password] [fullName] [pin]");
  console.log("Examples:");
  console.log("  1. Promote an existing account:");
  console.log("     node --env-file=.env scripts/create-admin.mjs user@example.com");
  console.log("  2. Create a new admin account:");
  console.log("     node --env-file=.env scripts/create-admin.mjs admin@meridian.com 'StrongPassword123!' 'Chief Admin' '123456'");
  console.log("------------------------------------------------------------------");
  process.exit(1);
}

const db = new PrismaClient();

try {
  const existing = await db.user.findUnique({
    where: { email },
    include: { accounts: true },
  });

  if (existing) {
    if (existing.role === "ADMIN") {
      console.log(`User ${email} is ALREADY an ADMIN.`);
    } else {
      await db.user.update({ where: { email }, data: { role: "ADMIN" } });
      await db.auditLog.create({
        data: { actorId: null, action: "admin.role.granted", metadata: { email } },
      });
      console.log(`Success! User ${email} has been promoted to ADMIN.`);
    }
  } else {
    if (!password) {
      console.error(`User ${email} does not exist yet.`);
      console.error(`To create a new admin directly, provide password:`);
      console.error(`node --env-file=.env scripts/create-admin.mjs ${email} <password> [fullName] [pin]`);
      process.exitCode = 1;
    } else {
      console.log(`Creating brand new admin account for ${email}...`);
      const [passwordHash, pinHash] = await Promise.all([
        hash(password, ARGON2_OPTIONS),
        hash(pin, ARGON2_OPTIONS),
      ]);

      const admin = await db.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          pinHash,
          role: "ADMIN",
          locale: "en",
          country: "US",
          kycStatus: "DEMO_VERIFIED",
          preferredCurrency: "USD",
          accounts: {
            create: {
              currency: "USD",
              accountNumber: generateAccountNumber(),
            },
          },
        },
      });

      await db.auditLog.create({
        data: { actorId: admin.id, action: "admin.created", targetId: admin.id },
      });

      console.log("==========================================================");
      console.log(`Admin account created successfully!`);
      console.log(`Email:    ${email}`);
      console.log(`Role:     ADMIN`);
      console.log(`Name:     ${fullName}`);
      console.log(`PIN:      ${pin}`);
      console.log("==========================================================");
      console.log(`You can now log in at http://localhost:3000/login`);
    }
  }
} catch (err) {
  console.error("Operation failed:", err.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

