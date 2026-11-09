import { z } from "zod";
import {
  GENDERS,
  KYC_DOCUMENT_TYPES,
  isCountry,
  isValidBirthDate,
  isAdult,
  isValidPostalCode,
  isValidPin,
  normalizePhone,
  passwordStrength,
} from "./signupRules";

// Error strings are message KEYS (see messages/*.json "Validation") so they translate automatically.
const text = (key: string, max = 100) => z.string().trim().min(1, key).max(max, key);
const emailOk = (v: string) => z.string().email().safeParse(v).success;

export const signupSchema = z
  .object({
    // Personal
    firstName: text("firstNameRequired", 60),
    lastName: text("lastNameRequired", 60),
    email: z.string().trim().toLowerCase().email("emailInvalid").max(254, "emailInvalid"),
    phone: z.string().trim().min(1, "phoneInvalid").max(30, "phoneInvalid"),
    dateOfBirth: z.string().trim(),
    gender: z.enum(GENDERS, { message: "genderInvalid" }),
    occupation: text("occupationRequired", 80),
    // Contact
    country: z.string().refine(isCountry, "countryInvalid"),
    city: text("cityRequired", 80),
    region: z.string().trim().max(80).optional().default(""),
    postalCode: z.string().trim().min(1, "postalInvalid").max(12, "postalInvalid"),
    address: text("addressRequired", 200),
    // Next of kin
    nokName: text("nokNameRequired", 100),
    nokEmail: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "nokEmailInvalid")
      .refine((v) => v === "" || emailOk(v), "nokEmailInvalid"), // optional
    nokPhone: z.string().trim().min(1, "nokPhoneInvalid").max(30, "nokPhoneInvalid"),
    nokRelationship: text("nokRelationshipRequired", 40),
    nokAddress: text("nokAddressRequired", 200),
    // Account
    preferredCurrency: z.enum(["USD", "KRW"], { message: "currencyInvalid" }),
    password: z.string().min(12, "passwordShort").max(200, "passwordShort"),
    confirmPassword: z.string(),
    pin: z.string().refine(isValidPin, "pinInvalid"),
    // Verification + consent
    kycDocumentType: z.enum(KYC_DOCUMENT_TYPES, { message: "kycDocumentInvalid" }),
    kycAck: z.boolean().refine((v) => v === true, "kycAckRequired"),
    marketingOptIn: z.boolean(),
    terms: z.boolean().refine((v) => v === true, "termsRequired"),
  })
  .superRefine((data, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const now = new Date();

    if (data.password !== data.confirmPassword) add("confirmPassword", "confirmMismatch");
    if (data.password.length >= 12 && passwordStrength(data.password) < 2) add("password", "passwordWeak");

    if (!isValidBirthDate(data.dateOfBirth, now)) add("dateOfBirth", "dobInvalid");
    else if (!isAdult(data.dateOfBirth, now)) add("dateOfBirth", "underAge");

    if (isCountry(data.country)) {
      if (normalizePhone(data.country, data.phone) === null) add("phone", "phoneInvalid");
      if (normalizePhone(data.country, data.nokPhone) === null) add("nokPhone", "nokPhoneInvalid");
      if (!isValidPostalCode(data.country, data.postalCode)) add("postalCode", "postalInvalid");
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("emailInvalid"),
  password: z.string().min(1).max(200),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
