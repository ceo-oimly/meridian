"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { adjustAction, statusAction, type AdminState } from "@/app/adminActions";
import { ADMIN_STATUSES } from "@/lib/adminRules";
import { useIdempotencyKey } from "./useIdempotencyKey";

const inputClass = "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";
const buttonClass =
  "rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-60";

function Message({ state }: { state: AdminState }) {
  const t = useTranslations("Admin");
  if (state.ok) {
    return <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">{t("success")}</p>;
  }
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
        {t(`errors.${state.error}` as never)}
      </p>
    );
  }
  return null;
}

export function AdjustForm({ accountId }: { accountId: string }) {
  const t = useTranslations("Admin");
  const [state, formAction, pending] = useActionState<AdminState, FormData>(adjustAction, {});
  const key = useIdempotencyKey(state);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-paper p-4">
      <h4 className="text-sm font-semibold">{t("adjust.title")}</h4>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium">
          {t("adjust.direction")}
          <select name="direction" defaultValue="credit" className={inputClass}>
            <option value="credit">{t("adjust.credit")}</option>
            <option value="debit">{t("adjust.debit")}</option>
          </select>
        </label>
        <label className="block text-xs font-medium">
          {t("adjust.amount")}
          <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
        </label>
      </div>
      <label className="block text-xs font-medium">
        {t("adjust.reason")}
        <input name="reason" required minLength={3} maxLength={200} autoComplete="off" className={inputClass} />
        <span className="mt-1 block font-normal text-ink-soft">{t("adjust.reasonHint")}</span>
      </label>
      <Message state={state} />
      <button type="submit" disabled={pending || !key} className={buttonClass}>{t("adjust.submit")}</button>
    </form>
  );
}

export function StatusForm({ accountId, current }: { accountId: string; current: string }) {
  const t = useTranslations("Admin");
  const tw = useTranslations("Wallet");
  const [state, formAction, pending] = useActionState<AdminState, FormData>(statusAction, {});

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-paper p-4">
      <h4 className="text-sm font-semibold">{t("status.title")}</h4>
      <input type="hidden" name="accountId" value={accountId} />
      <label className="block text-xs font-medium">
        {t("status.label")}
        <select name="status" defaultValue={current} className={inputClass}>
          {ADMIN_STATUSES.map((s) => (
            <option key={s} value={s}>{tw(`status.${s}`)}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium">
        {t("status.reason")}
        <input name="reason" required minLength={3} maxLength={200} autoComplete="off" className={inputClass} />
      </label>
      <Message state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>{t("status.submit")}</button>
    </form>
  );
}
