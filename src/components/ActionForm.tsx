"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ActionState } from "@/lib/actionState";
import { useIdempotencyKey } from "./useIdempotencyKey";
import { buttonClass, darkButtonClass, inputClass } from "./ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function StateMessage({ state, ns = "Wallet", infoLabel, infoHint }: {
  state: ActionState;
  ns?: "Wallet" | "Admin";
  infoLabel?: string;
  infoHint?: string;
}) {
  const t = useTranslations(ns);
  if (state.ok) {
    return (
      <div role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
        <p>{t("done")}</p>
        {state.info && (
          <p className="mt-1">
            {infoLabel ? `${infoLabel} ` : ""}
            <span className="font-mono font-semibold">{state.info}</span>
          </p>
        )}
        {state.info && infoHint && <p className="mt-1 text-xs">{infoHint}</p>}
      </div>
    );
  }
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {(t as (key: string, values?: Record<string, unknown>) => string)(`errors.${state.error}`, { count: state.attemptsLeft ?? 0 })}
      </p>
    );
  }
  return null;
}

/** A form wired to a server action, with an idempotency key, PIN field, and success/error message. */
export default function ActionForm({
  action,
  title,
  submit,
  children,
  pin = false,
  ns = "Wallet",
  dark = false,
  infoLabel,
  infoHint,
}: {
  action: Action;
  title?: string;
  submit: string;
  children?: ReactNode;
  pin?: boolean;
  ns?: "Wallet" | "Admin";
  dark?: boolean;
  infoLabel?: string;
  infoHint?: string;
}) {
  const t = useTranslations("Wallet");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const key = useIdempotencyKey(state);

  return (
    <form action={formAction} className="space-y-4">
      {title && <h3 className="font-display text-lg font-semibold">{title}</h3>}
      <input type="hidden" name="idempotencyKey" value={key} />
      {children}
      {pin && (
        <label className="block text-sm font-medium">
          {t("transfer.pin")}
          <input name="pin" type="password" inputMode="numeric" maxLength={6} required autoComplete="off" className={inputClass} />
        </label>
      )}
      <StateMessage state={state} ns={ns} infoLabel={infoLabel} infoHint={infoHint} />
      <button type="submit" disabled={pending || !key} className={dark ? darkButtonClass : buttonClass}>
        {submit}
      </button>
    </form>
  );
}
