"use server";

import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, getConstantTimeHash } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { signupSchema, loginSchema } from "@/lib/validation";
import { generateAccountNumber } from "@/lib/accountNumber";
import { buildFullName, normalizePhone, isCountry } from "@/lib/signupRules";
import { createLimiter } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emailTemplates";
import { reactivateAutoDormant } from "@/lib/walletService";
import { redirect } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

export interface FormState {
  // Form-level message key under "Auth.errors" or "Validation", or undefined when ok.
  error?: { scope: "Auth.errors" | "Validation"; key: string };
  // Field name -> message key under "Validation". Used by the multi-step signup form.
  fieldErrors?: Record<string, string>;
}

// In-memory limits: fine for one server. Use a shared store (Redis/Upstash) if you run several servers.
const loginLimiter = createLimiter(8, 15 * 60 * 1000);
const signupLimiter = createLimiter(20, 60 * 60 * 1000);

function isLocale(value: string): value is (typeof routing.locales)[number] {
  return (routing.locales as readonly string[]).includes(value);
}

async function clientInfo() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const localeRaw = field(formData, "locale") || routing.defaultLocale;
  const locale = isLocale(localeRaw) ? localeRaw : routing.defaultLocale;

  // Honeypot: real users never see or fill this field; simple bots fill every input.
  if (field(formData, "hp_check") !== "") {
    return { error: { scope: "Auth.errors", key: "generic" } };
  }

  if (!signupLimiter.hit((await clientInfo()).ip ?? "unknown")) {
    return { error: { scope: "Auth.errors", key: "tooManyAttempts" } };
  }

  const parsed = signupSchema.safeParse({
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    dateOfBirth: field(formData, "dateOfBirth"),
    gender: field(formData, "gender"),
    occupation: field(formData, "occupation"),
    country: field(formData, "country"),
    city: field(formData, "city"),
    region: field(formData, "region"),
    postalCode: field(formData, "postalCode"),
    address: field(formData, "address"),
    nokName: field(formData, "nokName"),
    nokEmail: field(formData, "nokEmail"),
    nokPhone: field(formData, "nokPhone"),
    nokRelationship: field(formData, "nokRelationship"),
    nokAddress: field(formData, "nokAddress"),
    preferredCurrency: field(formData, "preferredCurrency"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
    pin: field(formData, "pin"),
    kycDocumentType: field(formData, "kycDocumentType"),
    kycAck: formData.get("kycAck") === "on",
    marketingOptIn: formData.get("marketingOptIn") === "on",
    terms: formData.get("terms") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? "");
      if (name && !(name in fieldErrors)) fieldErrors[name] = issue.message;
    }
    console.warn("[signup] validation failed:", fieldErrors);
    return { fieldErrors };
  }

  const data = parsed.data;
  // The schema already guarantees these; the checks narrow the types.
  if (!isCountry(data.country)) return { fieldErrors: { country: "countryInvalid" } };
  const phone = normalizePhone(data.country, data.phone);
  const nokPhone = normalizePhone(data.country, data.nokPhone);
  if (!phone) return { fieldErrors: { phone: "phoneInvalid" } };
  if (!nokPhone) return { fieldErrors: { nokPhone: "nokPhoneInvalid" } };

  const { ip, userAgent } = await clientInfo();
  const [passwordHash, pinHash] = await Promise.all([hashPassword(data.password), hashPassword(data.pin)]);

  let userId: string | null = null;
  // Account numbers are random; retry in the rare case of a collision.
  for (let attempt = 0; attempt < 3 && !userId; attempt++) {
    try {
      const user = await db.user.create({
        data: {
          fullName: buildFullName(data.country, data.firstName, data.lastName),
          email: data.email,
          passwordHash,
          pinHash,
          locale,
          phone,
          country: data.country,
          dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00.000Z`),
          gender: data.gender,
          occupation: data.occupation,
          addressLine1: data.address,
          city: data.city,
          region: data.region || null,
          postalCode: data.postalCode,
          nokName: data.nokName,
          nokEmail: data.nokEmail || null,
          nokPhone,
          nokRelationship: data.nokRelationship,
          nokAddress: data.nokAddress,
          preferredCurrency: data.preferredCurrency,
          marketingOptIn: data.marketingOptIn,
          termsAcceptedAt: new Date(),
          // Standard verification: document type registered at signup.
          kycStatus: "DEMO_VERIFIED",
          kycDocumentType: data.kycDocumentType,
          // First wallet, in the currency they chose.
          accounts: {
            create: {
              currency: data.preferredCurrency,
              accountNumber: generateAccountNumber(),
            },
          },
        },
      });
      userId = user.id;
      await db.auditLog.create({
        data: { actorId: user.id, action: "auth.signup", targetId: user.id, ip },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("email")) {
          return { fieldErrors: { email: "emailTaken" } };
        }
        continue; // account number collision: try again with a new number
      }
      console.error("[signup] could not create user:", e);
      return { error: { scope: "Auth.errors", key: "generic" } };
    }
  }

  if (!userId) return { error: { scope: "Auth.errors", key: "generic" } };

  void sendEmail(data.email, welcomeEmail(locale, data.firstName));
  await createSession(userId, userAgent);
  redirect({ href: "/dashboard", locale });
  return {};
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const localeRaw = field(formData, "locale") || routing.defaultLocale;
  const locale = isLocale(localeRaw) ? localeRaw : routing.defaultLocale;

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: { scope: "Auth.errors", key: "invalidCredentials" } };
  }

  const { ip, userAgent } = await clientInfo();
  const limitKey = `${ip ?? "unknown"}:${parsed.data.email}`;
  if (!loginLimiter.hit(limitKey)) {
    return { error: { scope: "Auth.errors", key: "tooManyAttempts" } };
  }

  let user;
  let ok = false;
  try {
    user = await db.user.findUnique({ where: { email: parsed.data.email } });
    ok = await verifyPassword(user?.passwordHash ?? (await getConstantTimeHash()), parsed.data.password);
  } catch (e) {
    console.error("[login] database or password verification error:", e);
    return { error: { scope: "Auth.errors", key: "generic" } };
  }

  if (!user || !ok) {
    try {
      await db.auditLog.create({
        data: { actorId: user?.id ?? null, action: "auth.login.failed", ip },
      });
    } catch (e) {
      console.error("[login] auditLog failed:", e);
    }
    return { error: { scope: "Auth.errors", key: "invalidCredentials" } };
  }

  loginLimiter.reset(limitKey);

  try {
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await reactivateAutoDormant(user.id);
    await db.auditLog.create({ data: { actorId: user.id, action: "auth.login", ip } });
    await createSession(user.id, userAgent);
  } catch (e) {
    console.error("[login] session creation error:", e);
    return { error: { scope: "Auth.errors", key: "generic" } };
  }

  redirect({ href: "/dashboard", locale });
  return {};
}

export async function logoutAction() {
  await destroySession();
  redirect({ href: "/", locale: routing.defaultLocale });
}
