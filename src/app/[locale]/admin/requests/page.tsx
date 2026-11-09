import { getTranslations, setRequestLocale } from "next-intl/server";
import { INTL_TAG, redirect, type Locale } from "@/i18n/routing";
import { getAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import AppNav from "@/components/AppNav";
import ActionButton from "@/components/ActionButton";
import ActionForm from "@/components/ActionForm";
import { loanDecisionAction, externalDecisionAction, cardAdminAction, dormancyAction } from "@/app/adminFeatureActions";
import { panelClass } from "@/components/ui";

export default async function AdminQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await getAdmin();
  if (!admin) redirect({ href: "/dashboard", locale });
  if (!admin) return null;

  const t = await getTranslations("Queue");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });

  const [loans, transfers, cards] = await Promise.all([
    db.loan.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { fullName: true, email: true } } } }),
    db.externalTransfer.findMany({ where: { status: "PROCESSING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { fullName: true, email: true } } } }),
    db.card.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { fullName: true, email: true } }, account: { select: { currency: true } } } }),
  ]);

  return (
    <>
      <AppNav active="queue" isAdmin />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">{t("loans")}</h2>
          {loans.length === 0 ? (
            <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noneLoans")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {loans.map((l) => (
                <li key={l.id} className={panelClass}>
                  <p className="font-medium">
                    {l.user.fullName} · {formatMoney(l.principalMinor, l.currency, tag)}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {l.user.email} · {t("loanMeta", { apr: (l.aprBps / 100).toFixed(2), months: l.termMonths })} · {l.purpose} · {date.format(l.createdAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-line pt-4">
                    <ActionButton ns="Admin" action={loanDecisionAction} fields={{ loanId: l.id, decision: "approve" }} label={t("approve")} variant="dark" />
                    <ActionButton ns="Admin" action={loanDecisionAction} fields={{ loanId: l.id, decision: "reject" }} label={t("reject")} variant="danger" reasonLabel={t("reason")} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">{t("transfers")}</h2>
          {transfers.length === 0 ? (
            <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noneTransfers")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {transfers.map((x) => (
                <li key={x.id} className={panelClass}>
                  <p className="font-medium">
                    {x.user.fullName} → {x.recipientName} ({x.bankName}) · {formatMoney(x.amountMinor, x.currency, tag)}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {x.user.email} · ••••{x.recipientAccount.slice(-4)} · {t("feeLine", { fee: formatMoney(x.feeMinor, x.currency, tag) })} · {date.format(x.createdAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-line pt-4">
                    <ActionButton ns="Admin" action={externalDecisionAction} fields={{ transferId: x.id, decision: "complete" }} label={t("complete")} variant="dark" />
                    <ActionButton ns="Admin" action={externalDecisionAction} fields={{ transferId: x.id, decision: "reject" }} label={t("rejectRefund")} variant="danger" reasonLabel={t("reason")} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">{t("cards")}</h2>
          {cards.length === 0 ? (
            <p className={`${panelClass} mt-3 border-dashed text-ink-soft`}>{t("noneCards")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {cards.map((c) => (
                <li key={c.id} className={panelClass}>
                  <p className="font-medium">
                    •••• {c.last4} · {c.account.currency} · {t(`cardStatus.${c.status}`)}
                  </p>
                  <p className="text-xs text-ink-soft">{c.user.fullName} · {c.user.email}{c.statusReason ? ` · ${c.statusReason}` : ""}</p>
                  <div className="mt-3">
                    <ActionButton
                      ns="Admin"
                      action={cardAdminAction}
                      fields={{ cardId: c.id, status: c.status === "BLOCKED" ? "ACTIVE" : "BLOCKED" }}
                      label={c.status === "BLOCKED" ? t("unblock") : t("block")}
                      variant={c.status === "BLOCKED" ? "ghost" : "danger"}
                      reasonLabel={t("reason")}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panelClass} mt-10`}>
          <ActionForm ns="Admin" action={dormancyAction} title={t("dormancy.title")} submit={t("dormancy.submit")} dark infoLabel={t("dormancy.result")}>
            <p className="text-sm text-ink-soft">{t("dormancy.hint")}</p>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
