// Usage: npm run make-admin -- someone@example.com
// Promotes an existing account to ADMIN. Run it from the meridian-bank folder.
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- someone@example.com");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const result = await db.user.updateMany({ where: { email }, data: { role: "ADMIN" } });
  if (result.count === 0) {
    console.error(`No user found with email ${email}. Sign up first, then run this again.`);
    process.exitCode = 1;
  } else {
    await db.auditLog.create({ data: { actorId: null, action: "admin.role.granted", metadata: { email } } });
    console.log(`${email} is now an ADMIN.`);
  }
} finally {
  await db.$disconnect();
}
