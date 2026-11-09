"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ActionState } from "@/lib/actionState";
import { useIdempotencyKey } from "./useIdempotencyKey";
import { darkButtonClass, ghostButtonClass, dangerButtonClass, inputClass } from "./ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** One-click (or one-field) form: freeze a card, decline a request, approve a loan... */
export default function ActionButton({
  action,
  fields,
  label,
  variant = "ghost",
  pin = false,
  reasonLabel,
  ns = "Wallet",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  variant?: "ghost" | "dark" | "danger";
  pin?: boolean;
  /** When set, shows a required text box (an admin reason). Posted as "reason". */
  reasonLabel?: string;
  ns?: "Wallet" | "Admin";
}) {
  const t = useTranslations(ns);
  const tw = useTranslations("Wallet");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const key = useIdempotencyKey(state);
  const cls = variant === "dark" ? darkButtonClass : variant === "danger" ? dangerButtonClass : ghostButtonClass;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="idempotencyKey" value={key} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {reasonLabel && (
        <label className="text-xs font-medium">
          {reasonLabel}
          <input name="reason" required minLength={3} maxLength={200} autoComplete="off" className={`${inputClass} w-56`} />
        </label>
      )}
      {pin && (
        <label className="text-xs font-medium">
          {tw("transfer.pin")}
          <input name="pin" type="password" inputMode="numeric" maxLength={6} required autoComplete="off" className={`${inputClass} w-24`} />
        </label>
      )}
      <button type="submit" disabled={pending || !key} className={cls}>{label}</button>
      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {t(`errors.${state.error}` as never, { count: state.attemptsLeft ?? 0 })}
        </span>
      )}
      {state.ok && <span role="status" className="text-xs text-brand">{t("done")}</span>}
    </form>
  );
}
