// Usage: node --env-file=.env scripts/reset-password.mjs someone@example.com "NewPassword123!"
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const email = process.argv[2]?.trim().toLowerCase();
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log("Usage: node --env-file=.env scripts/reset-password.mjs <email> <newPassword>");
  process.exit(1);
}

const db = new PrismaClient();

try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exitCode = 1;
  } else {
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
    await db.user.update({
      where: { email },
      data: { passwordHash },
    });
    console.log(`Password for ${email} has been successfully updated.`);
    console.log(`You can now log in at http://localhost:3000/login with your new password.`);
  }
} catch (e) {
  console.error("Failed to update password:", e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

