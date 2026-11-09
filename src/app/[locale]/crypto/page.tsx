import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { formatMoney } from "@/lib/money";
import { CRYPTO_ASSETS, formatUnits, usdForUnits } from "@/lib/cryptoMath";
import { getCryptoPrices, getHoldings } from "@/lib/cryptoService";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import { cryptoBuyAction, cryptoSellAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function CryptoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("Crypto");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";

  const [{ prices, live }, holdings] = await Promise.all([getCryptoPrices(), getHoldings(user.id)]);
  // Price is USD x 1e8 per coin; show it in cents so formatMoney can display it.
  const priceCents = (p: bigint) => p / 1_000_000n;

  return (
    <>
      <AppNav active="crypto" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>
        <p className="mt-2 text-xs text-ink-soft">{live ? t("live") : t("fallbackPrices")}</p>

        <section className={`${panelClass} mt-6`}>
          <h2 className="font-display text-lg font-semibold">{t("market")}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {CRYPTO_ASSETS.map((a) => (
              <li key={a.symbol} className="flex justify-between py-2">
                <span>{a.name} <span className="text-ink-soft">{a.symbol}</span></span>
                <span className="tabular-nums">{formatMoney(priceCents(prices[a.symbol]), "USD", tag)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            <ActionForm action={cryptoBuyAction} title={t("buy.title")} submit={t("buy.submit")} pin>
              <label className="block text-sm font-medium">
                {t("asset")}
                <select name="symbol" className={inputClass}>
                  {CRYPTO_ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.name} ({a.symbol})</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("buy.amount")}
                <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
              </label>
              <p className="text-xs text-ink-soft">{t("buy.hint")}</p>
            </ActionForm>
          </section>
          <section className={panelClass}>
            <ActionForm action={cryptoSellAction} title={t("sell.title")} submit={t("sell.submit")} pin>
              <label className="block text-sm font-medium">
                {t("asset")}
                <select name="symbol" className={inputClass}>
                  {CRYPTO_ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.name} ({a.symbol})</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("sell.quantity")}
                <input name="quantity" inputMode="decimal" required autoComplete="off" className={inputClass} />
              </label>
              <p className="text-xs text-ink-soft">{t("sell.hint")}</p>
            </ActionForm>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">{t("holdings")}</h2>
          {holdings.length === 0 ? (
            <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noHoldings")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
              {holdings.map((h) => (
                <li key={h.asset} className="flex items-center justify-between px-5 py-4">
                  <span className="font-medium">{h.asset}</span>
                  <span className="text-right text-sm">
                    <span className="font-mono">{formatUnits(h.quantity)}</span>{" "}
                    <span className="text-ink-soft">≈ {formatMoney(usdForUnits(h.quantity, prices[h.asset]), "USD", tag)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
