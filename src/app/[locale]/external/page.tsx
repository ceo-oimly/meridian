import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { EXTERNAL_BANKS } from "@/lib/externalRules";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import { externalAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function ExternalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("External");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const when = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });

  const [wallets, transfers] = await Promise.all([
    db.account.findMany({ where: { userId: user.id, kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } }),
    db.externalTransfer.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <>
      <AppNav active="external" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section>
            {transfers.length === 0 ? (
              <p className={`${panelClass} border-dashed text-ink-soft`}>{t("empty")}</p>
            ) : (
              <ul className="space-y-3">
                {transfers.map((x) => (
                  <li key={x.id} className={panelClass}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{x.recipientName} · {x.bankName}</p>
                      <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium">{t(`status.${x.status}`)}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {formatMoney(x.amountMinor, x.currency, tag)}{" "}
                      <span className="text-ink-soft">+ {formatMoney(x.feeMinor, x.currency, tag)} {t("fee")}</span>
                    </p>
                    <p className="text-xs text-ink-soft">
                      ••••{x.recipientAccount.slice(-4)} · {when.format(x.createdAt)}
                      {x.decisionReason ? ` · ${x.decisionReason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className={`${panelClass} h-fit`}>
            <ActionForm action={externalAction} title={t("form.title")} submit={t("form.submit")} pin>
              <label className="block text-sm font-medium">
                {t("form.wallet")}
                <select name="accountId" required className={inputClass}>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.currency} · {formatMoney(w.balanceMinor, w.currency, tag)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("form.bank")}
                <select name="bank" required className={inputClass}>
                  {EXTERNAL_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("form.name")}
                <input name="recipientName" required maxLength={60} autoComplete="off" className={inputClass} />
              </label>
              <label className="block text-sm font-medium">
                {t("form.account")}
                <input name="recipientAccount" inputMode="numeric" required autoComplete="off" className={inputClass} />
                <span className="mt-1 block text-xs font-normal text-ink-soft">{t("form.accountHint")}</span>
              </label>
              <label className="block text-sm font-medium">
                {t("form.amount")}
                <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
              </label>
              <p className="text-xs text-ink-soft">{t("form.hint")}</p>
            </ActionForm>
          </aside>
        </div>
      </div>
    </>
  );
}
