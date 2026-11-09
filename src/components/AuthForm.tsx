"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { FormState } from "@/app/actions";

interface Props {
  mode: "login" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}

export default function AuthForm({ mode, action }: Props) {
  const t = useTranslations("Auth");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, {});

  const isSignup = mode === "signup";
  const errorText = state.error
    ? state.error.scope === "Validation"
      ? tv(state.error.key as never)
      : t(`errors.${state.error.key}` as never)
    : null;

  const inputClass =
    "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-ink placeholder:text-ink-soft/60";

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-display text-3xl font-semibold">
        {isSignup ? t("signupTitle") : t("loginTitle")}
      </h1>

      <form action={formAction} className="mt-8 space-y-5" noValidate>
        <input type="hidden" name="locale" value={locale} />

        {isSignup && (
          <label className="block text-sm font-medium">
            {t("fullName")}
            <input name="fullName" type="text" autoComplete="name" required className={inputClass} />
          </label>
        )}

        <label className="block text-sm font-medium">
          {t("email")}
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>

        <label className="block text-sm font-medium">
          {t("password")}
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 12 : undefined}
            className={inputClass}
          />
          {isSignup && <span className="mt-1 block text-xs text-ink-soft">{t("passwordHint")}</span>}
        </label>

        {errorText && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {errorText}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {isSignup ? t("signupSubmit") : t("loginSubmit")}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        {isSignup ? t("haveAccount") : t("noAccount")}{" "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-brand underline">
          {isSignup ? t("loginSubmit") : t("signupSubmit")}
        </Link>
      </p>
    </div>
  );
}
