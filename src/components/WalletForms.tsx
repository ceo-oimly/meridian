"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { transferAction, type WalletState } from "@/app/walletActions";
import { useIdempotencyKey } from "./useIdempotencyKey";
import type { CurrencyCode } from "@/lib/money";

export interface WalletOption {
  id: string;
  currency: CurrencyCode;
  label: string; // e.g. "USD ••••1234"
}

const inputClass = "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-ink";
const buttonClass =
  "rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60";

function Message({ state }: { state: WalletState }) {
  const t = useTranslations("Wallet");
  if (state.ok) {
    return <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{t("success")}</p>;
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

export function TransferForm({ wallets }: { wallets: WalletOption[] }) {
  const t = useTranslations("Wallet");
  const [state, formAction, pending] = useActionState<WalletState, FormData>(transferAction, {});
  const key = useIdempotencyKey(state);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-xl font-semibold">{t("transfer.title")}</h2>
      <input type="hidden" name="idempotencyKey" value={key} />
      <label className="block text-sm font-medium">
        {t("transfer.from")}
        <select name="fromAccountId" required className={inputClass}>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t("transfer.to")}
        <input name="toAccountNumber" inputMode="numeric" required autoComplete="off" className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-ink-soft">{t("transfer.toHint")}</span>
      </label>
      <label className="block text-sm font-medium">
        {t("amount")}
        <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        {t("transfer.memo")}
        <input name="memo" maxLength={100} autoComplete="off" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        {t("transfer.pin")}
        <input name="pin" type="password" inputMode="numeric" maxLength={6} required autoComplete="off" className={inputClass} />
      </label>
      <Message state={state} />
      <button type="submit" disabled={pending || !key} className={buttonClass}>{t("transfer.submit")}</button>
    </form>
  );
}
