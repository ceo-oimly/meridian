"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { FormState } from "@/app/actions";
import {
  GENDERS,
  KYC_DOCUMENT_TYPES,
  passwordStrength,
  type Country,
} from "@/lib/signupRules";

interface Props {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}

const STEPS = ["personal", "contact", "kin", "account", "verify"] as const;

// Which step each field lives on, so server errors can jump the user to the right step.
const FIELD_STEP: Record<string, number> = {
  firstName: 0, lastName: 0, email: 0, phone: 0, dateOfBirth: 0, gender: 0, occupation: 0,
  country: 1, city: 1, region: 1, postalCode: 1, address: 1,
  nokName: 2, nokEmail: 2, nokPhone: 2, nokRelationship: 2, nokAddress: 2,
  preferredCurrency: 3, password: 3, confirmPassword: 3, pin: 3,
  kycDocumentType: 4, kycAck: 4, terms: 4,
};

const CITIES: Record<"en" | "ko", Record<Country, string[]>> = {
  en: {
    US: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Diego", "Dallas", "San Francisco", "Seattle", "Boston", "Atlanta"],
    KR: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan", "Jeju"],
  },
  ko: {
    US: ["뉴욕", "로스앤젤레스", "시카고", "휴스턴", "피닉스", "필라델피아", "샌디에이고", "댈러스", "샌프란시스코", "시애틀", "보스턴", "애틀랜타"],
    KR: ["서울", "부산", "인천", "대구", "대전", "광주", "수원", "울산", "제주"],
  },
};

interface Values {
  firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string;
  gender: string; occupation: string;
  country: Country; city: string; region: string; postalCode: string; address: string;
  nokName: string; nokEmail: string; nokPhone: string; nokRelationship: string; nokAddress: string;
  preferredCurrency: "USD" | "KRW"; password: string; confirmPassword: string; pin: string;
  kycDocumentType: string; kycAck: boolean; marketingOptIn: boolean; terms: boolean;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-ink placeholder:text-ink-soft/60 aria-[invalid=true]:border-danger";

function Field({
  label, error, hint, children,
}: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && !error && <span className="mt-1 block text-xs font-normal text-ink-soft">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs font-normal text-danger">{error}</span>}
    </label>
  );
}

export default function SignupForm({ action }: Props) {
  const t = useTranslations("Signup");
  const tv = useTranslations("Validation");
  const ta = useTranslations("Auth");
  const locale = useLocale() as "en" | "ko";
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [showErrors, setShowErrors] = useState(false);

  const initialCountry: Country = locale === "ko" ? "KR" : "US";
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({
    firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "", occupation: "",
    country: initialCountry, city: "", region: "", postalCode: "", address: "",
    nokName: "", nokEmail: "", nokPhone: "", nokRelationship: "", nokAddress: "",
    preferredCurrency: initialCountry === "KR" ? "KRW" : "USD",
    password: "", confirmPassword: "", pin: "",
    kycDocumentType: "", kycAck: false, marketingOptIn: false, terms: false,
  });

  const set =
    (name: keyof Values) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = e.target;
      const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
      setV((prev) => ({ ...prev, [name]: value }));
    };

  const strength = passwordStrength(v.password);
  const mismatch = v.confirmPassword !== "" && v.password !== v.confirmPassword;

  // Native validation message on the confirm field, so the step check catches it.
  useEffect(() => {
    confirmRef.current?.setCustomValidity(mismatch ? tv("confirmMismatch") : "");
  }, [mismatch, tv]);

  // After a server response with field errors, jump to the earliest step that has one.
  useEffect(() => {
    const names = Object.keys(state.fieldErrors ?? {});
    if (names.length > 0) {
      setStep(Math.min(...names.map((n) => FIELD_STEP[n] ?? 0)));
      setShowErrors(true);
      // Bring the error summary into view so it can't be missed.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        summaryRef.current?.focus();
      });
    }
  }, [state]);

  const err = (name: string) => {
    const key = state.fieldErrors?.[name];
    return key ? tv(key as never) : null;
  };
  const invalid = (name: string) => (state.fieldErrors?.[name] ? true : undefined);

  function firstInvalidIn(stepIndex: number): HTMLInputElement | null {
    const els = formRef.current?.querySelectorAll<HTMLInputElement>(
      `[data-step="${stepIndex}"] input, [data-step="${stepIndex}"] select, [data-step="${stepIndex}"] textarea`,
    );
    for (const el of els ?? []) if (!el.checkValidity()) return el;
    return null;
  }

  function goTo(stepIndex: number, el: HTMLInputElement | null) {
    setStep(stepIndex);
    // Wait for the step to become visible before showing the browser's validation bubble.
    requestAnimationFrame(() => el?.reportValidity());
  }

  function next() {
    const bad = firstInvalidIn(step);
    if (bad) return goTo(step, bad);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    for (let i = 0; i < STEPS.length; i++) {
      const bad = firstInvalidIn(i);
      if (bad) {
        e.preventDefault();
        return goTo(i, bad);
      }
    }
  }

  const isUS = v.country === "US";
  const todayIso = new Date().toISOString().slice(0, 10);
  const hide = (i: number) => step !== i;
  const regionLabel = isUS ? t("fields.regionUS") : t("fields.regionKR");

  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">{ta("signupTitle")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("subtitle")}</p>

      <ol className="mt-8 grid grid-cols-5 gap-1.5" aria-label={t("stepOf", { current: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s} className="text-center">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
            <span className={`mt-1 block text-[11px] ${i === step ? "font-semibold text-ink" : "text-ink-soft"}`}>
              {t(`steps.${s}`)}
            </span>
          </li>
        ))}
      </ol>

      <form ref={formRef} action={formAction} onSubmit={onSubmit} onChange={() => setShowErrors(false)} className="mt-8" noValidate>
        <input type="hidden" name="locale" value={locale} />
        {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Company website
            <input type="text" name="hp_check" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {showErrors && state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-6 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">{t("fixErrors")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(state.fieldErrors).map(([name, key]) => (
                <li key={name}>
                  <button type="button" className="font-medium underline" onClick={() => setStep(FIELD_STEP[name] ?? 0)}>
                    {t(`steps.${STEPS[FIELD_STEP[name] ?? 0]}`)}
                  </button>
                  : {tv(key as never)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step 1: Personal */}
        <fieldset data-step={0} hidden={hide(0)} className="space-y-5">
          <legend className="mb-4 font-display text-xl font-semibold">{t("headings.personal")}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.firstName")} error={err("firstName")}>
              <input name="firstName" value={v.firstName} onChange={set("firstName")} autoComplete="given-name" required aria-invalid={invalid("firstName")} className={inputClass} />
            </Field>
            <Field label={t("fields.lastName")} error={err("lastName")}>
              <input name="lastName" value={v.lastName} onChange={set("lastName")} autoComplete="family-name" required aria-invalid={invalid("lastName")} className={inputClass} />
            </Field>
          </div>
          <Field label={ta("email")} error={err("email")}>
            <input name="email" type="email" value={v.email} onChange={set("email")} autoComplete="email" required aria-invalid={invalid("email")} className={inputClass} />
          </Field>
          <Field label={t("fields.phone")} error={err("phone")} hint={isUS ? t("hints.phoneUS") : t("hints.phoneKR")}>
            <input name="phone" type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" required aria-invalid={invalid("phone")} className={inputClass} />
          </Field>
          <Field label={t("fields.dateOfBirth")} error={err("dateOfBirth")} hint={t("hints.dateOfBirth")}>
            <input name="dateOfBirth" type="date" max={todayIso} value={v.dateOfBirth} onChange={set("dateOfBirth")} autoComplete="bday" required aria-invalid={invalid("dateOfBirth")} className={inputClass} />
          </Field>
          <Field label={t("fields.gender")} error={err("gender")}>
            <select name="gender" value={v.gender} onChange={set("gender")} required aria-invalid={invalid("gender")} className={inputClass}>
              <option value="" disabled>{t("select")}</option>
              {GENDERS.map((g) => <option key={g} value={g}>{t(`genders.${g}`)}</option>)}
            </select>
          </Field>
          <Field label={t("fields.occupation")} error={err("occupation")}>
            <input name="occupation" value={v.occupation} onChange={set("occupation")} autoComplete="organization-title" required aria-invalid={invalid("occupation")} className={inputClass} />
          </Field>
        </fieldset>

        {/* Step 2: Contact */}
        <fieldset data-step={1} hidden={hide(1)} className="space-y-5">
          <legend className="mb-4 font-display text-xl font-semibold">{t("headings.contact")}</legend>
          <Field label={t("fields.country")} error={err("country")}>
            <select
              name="country"
              value={v.country}
              onChange={(e) => {
                const country = e.target.value as Country;
                setV((p) => ({ ...p, country, city: "", preferredCurrency: country === "KR" ? "KRW" : "USD" }));
              }}
              autoComplete="country"
              required
              className={inputClass}
            >
              <option value="US">{t("countries.US")}</option>
              <option value="KR">{t("countries.KR")}</option>
            </select>
          </Field>
          <Field label={t("fields.city")} error={err("city")}>
            <input name="city" list="city-options" value={v.city} onChange={set("city")} autoComplete="address-level2" required aria-invalid={invalid("city")} className={inputClass} />
            <datalist id="city-options">
              {CITIES[locale][v.country].map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label={`${regionLabel} ${t("optional")}`} error={err("region")}>
            <input name="region" value={v.region} onChange={set("region")} autoComplete="address-level1" className={inputClass} />
          </Field>
          <Field label={isUS ? t("fields.postalCodeUS") : t("fields.postalCodeKR")} error={err("postalCode")}>
            <input name="postalCode" inputMode="numeric" value={v.postalCode} onChange={set("postalCode")} autoComplete="postal-code" required aria-invalid={invalid("postalCode")} className={inputClass} />
          </Field>
          <Field label={t("fields.address")} error={err("address")}>
            <textarea name="address" rows={3} value={v.address} onChange={set("address")} autoComplete="street-address" required aria-invalid={invalid("address")} className={inputClass} />
          </Field>
        </fieldset>

        {/* Step 3: Next of kin */}
        <fieldset data-step={2} hidden={hide(2)} className="space-y-5">
          <legend className="mb-4 font-display text-xl font-semibold">{t("headings.kin")}</legend>
          <Field label={t("fields.nokName")} error={err("nokName")}>
            <input name="nokName" value={v.nokName} onChange={set("nokName")} required aria-invalid={invalid("nokName")} className={inputClass} />
          </Field>
          <Field label={`${ta("email")} ${t("optional")}`} error={err("nokEmail")}>
            <input name="nokEmail" type="email" value={v.nokEmail} onChange={set("nokEmail")} aria-invalid={invalid("nokEmail")} className={inputClass} />
          </Field>
          <Field label={t("fields.nokPhone")} error={err("nokPhone")}>
            <input name="nokPhone" type="tel" value={v.nokPhone} onChange={set("nokPhone")} required aria-invalid={invalid("nokPhone")} className={inputClass} />
          </Field>
          <Field label={t("fields.nokRelationship")} error={err("nokRelationship")}>
            <input name="nokRelationship" placeholder={t("hints.relationship")} value={v.nokRelationship} onChange={set("nokRelationship")} required aria-invalid={invalid("nokRelationship")} className={inputClass} />
          </Field>
          <Field label={t("fields.nokAddress")} error={err("nokAddress")}>
            <textarea name="nokAddress" rows={3} value={v.nokAddress} onChange={set("nokAddress")} required aria-invalid={invalid("nokAddress")} className={inputClass} />
          </Field>
        </fieldset>

        {/* Step 4: Account */}
        <fieldset data-step={3} hidden={hide(3)} className="space-y-5">
          <legend className="mb-4 font-display text-xl font-semibold">{t("headings.account")}</legend>
          <Field label={t("fields.preferredCurrency")} error={err("preferredCurrency")}>
            <select name="preferredCurrency" value={v.preferredCurrency} onChange={set("preferredCurrency")} required className={inputClass}>
              <option value="USD">{t("currencies.USD")}</option>
              <option value="KRW">{t("currencies.KRW")}</option>
            </select>
          </Field>
          <Field label={ta("password")} error={err("password")} hint={ta("passwordHint")}>
            <input name="password" type="password" value={v.password} onChange={set("password")} autoComplete="new-password" required minLength={12} aria-invalid={invalid("password")} className={inputClass} />
          </Field>
          <div aria-live="polite" className="-mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`h-1.5 flex-1 rounded-full ${
                    v.password && strength >= n ? (strength <= 1 ? "bg-danger" : strength === 2 ? "bg-accent" : "bg-brand") : "bg-line"
                  }`}
                />
              ))}
            </div>
            {v.password && (
              <p className="mt-1 text-xs text-ink-soft">
                {t("strength.label")}: {t(`strength.levels.${strength}`)}
              </p>
            )}
          </div>
          <Field label={t("fields.confirmPassword")} error={err("confirmPassword") ?? (mismatch ? tv("confirmMismatch") : null)}>
            <input ref={confirmRef} name="confirmPassword" type="password" value={v.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" required aria-invalid={mismatch || invalid("confirmPassword")} className={inputClass} />
          </Field>
          <Field label={t("fields.pin")} error={err("pin")} hint={t("hints.pin")}>
            <input name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={v.pin} onChange={set("pin")} autoComplete="off" required aria-invalid={invalid("pin")} className={inputClass} />
          </Field>
        </fieldset>

        {/* Step 5: Demo verification + consent */}
        <fieldset data-step={4} hidden={hide(4)} className="space-y-5">
          <legend className="mb-4 font-display text-xl font-semibold">{t("headings.verify")}</legend>
          <p className="rounded-lg border border-accent/60 bg-accent/10 p-3 text-sm text-ink">{t("kycNotice")}</p>
          <Field label={t("fields.kycDocumentType")} error={err("kycDocumentType")}>
            <select name="kycDocumentType" value={v.kycDocumentType} onChange={set("kycDocumentType")} required aria-invalid={invalid("kycDocumentType")} className={inputClass}>
              <option value="" disabled>{t("select")}</option>
              {KYC_DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{t(`documents.${d}`)}</option>)}
            </select>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="kycAck" checked={v.kycAck} onChange={set("kycAck")} required className="mt-1" />
            <span>
              {t("kycAck")}
              {err("kycAck") && <span role="alert" className="mt-1 block text-xs text-danger">{err("kycAck")}</span>}
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="terms" checked={v.terms} onChange={set("terms")} required className="mt-1" />
            <span>
              {t("terms")}
              {err("terms") && <span role="alert" className="mt-1 block text-xs text-danger">{err("terms")}</span>}
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="marketingOptIn" checked={v.marketingOptIn} onChange={set("marketingOptIn")} className="mt-1" />
            <span>{t("marketing")}</span>
          </label>
        </fieldset>

        {state.error && (
          <p role="alert" className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error.scope === "Validation" ? tv(state.error.key as never) : ta(`errors.${state.error.key}` as never)}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            className={`rounded-full border border-line bg-card px-6 py-3 font-medium ${step === 0 ? "invisible" : ""}`}
          >
            {t("back")}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="rounded-full bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-dark">
              {t("next")}
            </button>
          ) : (
            <button type="submit" disabled={pending} className="rounded-full bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-dark disabled:opacity-60">
              {ta("signupSubmit")}
            </button>
          )}
        </div>
      </form>

      <p className="mt-8 text-sm text-ink-soft">
        {ta("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand underline">{ta("loginSubmit")}</Link>
      </p>
    </div>
  );
}
