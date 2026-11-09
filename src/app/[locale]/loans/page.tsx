import { getTranslations } from "next-intl/server";
import { INTL_TAG, type Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/pageHelpers";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { LOAN_TERMS, aprBpsForTerm } from "@/lib/loanRules";
import { LOAN_MAX_MINOR } from "@/lib/limits";
import AppNav from "@/components/AppNav";
import ActionForm from "@/components/ActionForm";
import { loanApplyAction, loanRepayAction } from "@/app/featureActions";
import { inputClass, panelClass } from "@/components/ui";

export default async function LoansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUserPage(locale);
  const t = await getTranslations("Loans");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });

  const [wallets, loans] = await Promise.all([
    db.account.findMany({ where: { userId: user.id, kind: "CUSTOMER" }, orderBy: { createdAt: "asc" } }),
    db.loan.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { installments: { orderBy: { number: "asc" } } } }),
  ]);
  const hasOpen = loans.some((l) => l.status === "PENDING" || l.status === "ACTIVE");

  return (
    <>
      <AppNav active="loans" isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-5">
            {loans.length === 0 && <p className={`${panelClass} border-dashed text-ink-soft`}>{t("empty")}</p>}
            {loans.map((l) => {
              const next = l.installments.find((i) => !i.paidAt);
              const paid = l.installments.filter((i) => i.paidAt).length;
              return (
                <article key={l.id} className={panelClass}>
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-semibold">{formatMoney(l.principalMinor, l.currency, tag)}</h2>
                    <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium">{t(`status.${l.status}`)}</span>
                  </header>
                  <p className="mt-1 text-sm text-ink-soft">
                    {t("meta", { apr: (l.aprBps / 100).toFixed(2), months: l.termMonths })} · {l.purpose}
                  </p>
                  {l.decisionReason && <p className="mt-1 text-xs text-ink-soft">{t("note")}: {l.decisionReason}</p>}

                  {l.installments.length > 0 && (
                    <>
                      <p className="mt-4 text-sm font-medium">{t("progress", { paid, total: l.installments.length })}</p>
                      <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
                        {l.installments.map((i) => (
                          <li key={i.id} className="flex items-center justify-between px-4 py-2">
                            <span>#{i.number} · {date.format(i.dueDate)}</span>
                            <span className={i.paidAt ? "text-brand" : ""}>
                              {formatMoney(i.principalMinor + i.interestMinor, l.currency, tag)}
                              {i.paidAt ? ` · ${t("paid")}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {l.status === "ACTIVE" && next && (
                    <div className="mt-4 border-t border-line pt-4">
                      <ActionForm
                        action={loanRepayAction}
                        title={t("repay.title", { amount: formatMoney(next.principalMinor + next.interestMinor, l.currency, tag) })}
                        submit={t("repay.submit")}
                        pin
                      >
                        <input type="hidden" name="loanId" value={l.id} />
                      </ActionForm>
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <aside className={`${panelClass} h-fit`}>
            {hasOpen ? (
              <p className="text-sm text-ink-soft">{t("oneAtATime")}</p>
            ) : wallets.length === 0 ? null : (
              <ActionForm action={loanApplyAction} title={t("apply.title")} submit={t("apply.submit")} pin>
                <label className="block text-sm font-medium">
                  {t("apply.wallet")}
                  <select name="accountId" required className={inputClass}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.currency} (max {formatMoney(LOAN_MAX_MINOR[w.currency], w.currency, tag)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t("apply.amount")}
                  <input name="amount" inputMode="decimal" required autoComplete="off" className={inputClass} />
                </label>
                <label className="block text-sm font-medium">
                  {t("apply.term")}
                  <select name="termMonths" defaultValue="12" className={inputClass}>
                    {LOAN_TERMS.map((m) => (
                      <option key={m} value={m}>{t("apply.termOption", { months: m, apr: (aprBpsForTerm(m) / 100).toFixed(2) })}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t("apply.purpose")}
                  <input name="purpose" required minLength={3} maxLength={120} autoComplete="off" className={inputClass} />
                </label>
                <p className="text-xs text-ink-soft">{t("apply.hint")}</p>
              </ActionForm>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
