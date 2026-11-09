import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import ActionButton from "@/components/ActionButton";
import { requestCreateAction, requestPayAction, requestDeclineAction, requestCancelAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function RequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("Requests");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });

  const [wallets, incoming, outgoing] = await Promise.all([
    db.account.findMany({ where: { userId: user.id, kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } }),
    db.paymentRequest.findMany({
      where: { payerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requester: { select: { fullName: true, email: true } } },
    }),
    db.paymentRequest.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { payer: { select: { fullName: true, email: true } } },
    }),
  ]);

  return (
    <>
      <AppNav active="requests" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-8">
            <section>
              <h2 className="font-display text-xl font-semibold">{t("incoming")}</h2>
              {incoming.length === 0 ? (
                <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noneIncoming")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {incoming.map((r) => (
                    <li key={r.id} className={panelClass}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{t("from", { name: r.requester.fullName })}</p>
                        <p className="font-semibold tabular-nums">{formatMoney(r.amountMinor, r.currency, tag)}</p>
                      </div>
                      <p className="text-xs text-ink-soft">
                        {date.format(r.createdAt)}{r.note ? ` · ${r.note}` : ""} · {t(`status.${r.status}`)}
                      </p>
                      {r.status === "PENDING" && (
                        <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
                          <ActionButton action={requestPayAction} fields={{ requestId: r.id }} label={t("pay")} variant="dark" pin />
                          <ActionButton action={requestDeclineAction} fields={{ requestId: r.id }} label={t("decline")} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold">{t("outgoing")}</h2>
              {outgoing.length === 0 ? (
                <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noneOutgoing")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {outgoing.map((r) => (
                    <li key={r.id} className={panelClass}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{t("to", { name: r.payer.fullName })}</p>
                        <p className="font-semibold tabular-nums">{formatMoney(r.amountMinor, r.currency, tag)}</p>
                      </div>
                      <p className="text-xs text-ink-soft">
                        {date.format(r.createdAt)}{r.note ? ` · ${r.note}` : ""} · {t(`status.${r.status}`)}
                      </p>
                      {r.status === "PENDING" && (
                        <div className="mt-3">
                          <ActionButton action={requestCancelAction} fields={{ requestId: r.id }} label={t("cancel")} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className={`${panelClass} h-fit`}>
            <ActionForm action={requestCreateAction} title={t("create.title")} submit={t("create.submit")}>
              <label className="block text-sm font-medium">
                {t("create.wallet")}
                <select name="accountId" required className={inputClass}>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.currency} ••••{w.accountNumber.slice(-4)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("create.email")}
                <input name="payerEmail" type="email" required autoComplete="off" className={inputClass} />
              </label>
              <label className="block text-sm font-medium">
                {t("create.amount")}
                <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
              </label>
              <label className="block text-sm font-medium">
                {t("create.note")}
                <input name="note" maxLength={100} autoComplete="off" className={inputClass} />
              </label>
            </ActionForm>
          </aside>
        </div>
      </div>
    </>
  );
}
