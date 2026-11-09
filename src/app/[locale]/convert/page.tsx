import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { db } from "@/lib/db";
import { CURRENCIES, formatMoney, trimRate } from "@/lib/money";
import { customerRate, FX_SPREAD_BPS } from "@/lib/fxRates";
import { getUsdRates } from "@/lib/rates";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import { convertAction, openWalletAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function ConvertPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("Convert");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";

  const wallets = await db.account.findMany({ where: { userId: user.id, kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } });
  const owned = new Set(wallets.map((w) => w.currency));
  const missing = CURRENCIES.filter((c) => !owned.has(c));
  const { rates, live } = await getUsdRates();

  return (
    <>
      <AppNav active="convert" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle", { spread: (FX_SPREAD_BPS / 100).toFixed(2) })}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            {wallets.length < 2 ? (
              <p className="text-sm text-ink-soft">{t("needTwo")}</p>
            ) : (
              <ActionForm action={convertAction} title={t("form.title")} submit={t("form.submit")} pin>
                <label className="block text-sm font-medium">
                  {t("form.from")}
                  <select name="fromAccountId" required className={inputClass}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.currency} · {formatMoney(w.balanceMinor, w.currency, tag)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t("form.to")}
                  <select name="toCurrency" required className={inputClass}>
                    {wallets.map((w) => <option key={w.id} value={w.currency}>{w.currency}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t("form.amount")}
                  <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
                </label>
                <p className="text-xs text-ink-soft">{t("form.hint")}</p>
              </ActionForm>
            )}
          </section>

          <section className={panelClass}>
            {missing.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("allOpen")}</p>
            ) : (
              <ActionForm action={openWalletAction} title={t("open.title")} submit={t("open.submit")}>
                <label className="block text-sm font-medium">
                  {t("open.currency")}
                  <select name="currency" required className={inputClass}>
                    {missing.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <p className="text-xs text-ink-soft">{t("open.hint")}</p>
              </ActionForm>
            )}
          </section>
        </div>

        <section className={`${panelClass} mt-6`}>
          <h2 className="font-display text-lg font-semibold">{t("rates.title")}</h2>
          <p className="mt-1 text-xs text-ink-soft">{live ? t("rates.live") : t("rates.fallback")}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.filter((c) => c !== "USD").map((c) => (
              <li key={c} className="flex justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                <span>1 USD</span>
                <span className="font-mono">{trimRate(customerRate(rates, "USD", c))} {c}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
