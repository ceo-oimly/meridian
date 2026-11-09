import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { spentThisMonth } from "@/lib/cardService";
import { MAX_CARDS_PER_USER } from "@/lib/cards";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import ActionButton from "@/components/ActionButton";
import { createCardAction, cardStatusAction, cardPurchaseAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function CardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("Cards");
  const tw = await getTranslations("Wallet");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const now = new Date();

  const [wallets, cards] = await Promise.all([
    db.account.findMany({ where: { userId: user.id, kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } }),
    db.card.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { account: true } }),
  ]);
  const spent = await Promise.all(cards.map((c) => spentThisMonth(c.id, c.accountId, now)));
  const canCreate = cards.filter((c) => c.status !== "BLOCKED").length < MAX_CARDS_PER_USER;

  return (
    <>
      <AppNav active="cards" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-5">
            {cards.length === 0 && <p className={`${panelClass} border-dashed text-ink-soft`}>{t("empty")}</p>}
            {cards.map((c, i) => {
              const cur = c.account.currency;
              return (
                <article key={c.id} className={panelClass}>
                  <div className="rounded-2xl bg-ink p-5 text-paper">
                    <div className="flex items-center justify-between text-xs text-paper/70">
                      <span>Meridian · {cur}</span>
                      <span className="rounded-full bg-paper/20 px-2 py-0.5">{t(`status.${c.status}`)}</span>
                    </div>
                    <p className="mt-6 font-mono text-xl tracking-widest">•••• •••• •••• {c.last4}</p>
                    <div className="mt-4 flex justify-between text-xs text-paper/80">
                      <span>{c.nameOnCard}</span>
                      <span>{String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}</span>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-ink-soft">{t("perTx")}</dt>
                    <dd className="text-right">{formatMoney(c.perTxLimitMinor, cur, tag)}</dd>
                    <dt className="text-ink-soft">{t("monthly")}</dt>
                    <dd className="text-right">{formatMoney(spent[i], cur, tag)} / {formatMoney(c.monthlyLimitMinor, cur, tag)}</dd>
                  </dl>
                  {c.statusReason && <p className="mt-2 text-xs text-danger">{c.statusReason}</p>}

                  {c.status !== "BLOCKED" && (
                    <div className="mt-4 space-y-4 border-t border-line pt-4">
                      <ActionButton
                        action={cardStatusAction}
                        fields={{ cardId: c.id, status: c.status === "FROZEN" ? "ACTIVE" : "FROZEN" }}
                        label={c.status === "FROZEN" ? t("unfreeze") : t("freeze")}
                      />
                      {c.status === "ACTIVE" && (
                        <ActionForm action={cardPurchaseAction} title={t("purchase.title")} submit={t("purchase.submit")}>
                          <input type="hidden" name="cardId" value={c.id} />
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block text-sm font-medium">
                              {t("purchase.merchant")}
                              <input name="merchant" required minLength={2} maxLength={60} autoComplete="off" className={inputClass} />
                            </label>
                            <label className="block text-sm font-medium">
                              {tw("amount")}
                              <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
                            </label>
                          </div>
                          <p className="text-xs text-ink-soft">{t("purchase.hint")}</p>
                        </ActionForm>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <aside className={`${panelClass} h-fit`}>
            {wallets.length === 0 || !canCreate ? (
              <p className="text-sm text-ink-soft">{t("limitReached", { max: MAX_CARDS_PER_USER })}</p>
            ) : (
              <ActionForm
                action={createCardAction}
                title={t("create.title")}
                submit={t("create.submit")}
                pin
                infoHint={t("create.shownOnce")}
              >
                <label className="block text-sm font-medium">
                  {t("create.wallet")}
                  <select name="accountId" required className={inputClass}>
                    {wallets.map((w) => <option key={w.id} value={w.id}>{w.currency} ••••{w.accountNumber.slice(-4)}</option>)}
                  </select>
                </label>
                <p className="text-xs text-ink-soft">{t("create.hint")}</p>
              </ActionForm>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
