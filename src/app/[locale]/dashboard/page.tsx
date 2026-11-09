import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, INTL_TAG, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/session";
import { getWalletOverview } from "@/lib/ledgerService";
import { formatMoney } from "@/lib/money";
import { TransferForm, type WalletOption } from "@/components/WalletForms";
import { historyLabelKey } from "@/lib/historyLabels";
import AppNav from "@/components/AppNav";

const mask = (accountNumber: string) => `••••${accountNumber.slice(-4)}`;

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });
  if (!user) return null; // redirect() throws; this narrows the type

  const t = await getTranslations("Dashboard");
  const tw = await getTranslations("Wallet");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const { accounts, entries } = await getWalletOverview(user.id);

  const when = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });

  const wallets: WalletOption[] = accounts.map((a) => ({
    id: a.id,
    currency: a.currency,
    label: `${a.currency} ${mask(a.accountNumber)}`,
  }));

  return (
    <>
    <AppNav active="dashboard" isAdmin={user.role === "ADMIN"} />
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-ink-soft">{user.fullName}</p>
        </div>
        <div className="flex items-center gap-3">
        </div>
      </div>

      {/* Wallets */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-3xl bg-brand p-6 text-white shadow-lg">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>{a.currency}</span>
              {a.status !== "ACTIVE" && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{tw(`status.${a.status}`)}</span>
              )}
            </div>
            <p className="mt-2 font-display text-4xl">{formatMoney(a.balanceMinor, a.currency, tag)}</p>
            <p className="mt-4 text-sm text-white/70">
              {tw("accountNumber")}: <span className="font-mono text-white">{a.accountNumber}</span>
            </p>
            <a
              href={`/api/statement?account=${a.id}`}
              className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {tw("downloadStatement")}
            </a>
          </div>
        ))}
      </section>

      {/* Actions */}
      <section className="mt-8 max-w-xl">
        <TransferForm wallets={wallets} />
      </section>

      {/* History */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">{tw("history.title")}</h2>
        {entries.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-card p-8 text-ink-soft">
            {tw("history.empty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
            {entries.map((e) => {
              const credit = e.amountMinor > 0n;
              const other = e.transaction.entries.find((x) => x.accountId !== e.accountId);
              const counterparty = other && other.account.kind === "CUSTOMER" ? mask(other.account.accountNumber) : "";
              const labelKey = historyLabelKey(e.transaction.type, credit);
              const label = labelKey
                ? tw(`history.${labelKey}` as never)
                : credit
                  ? tw("history.received", { account: counterparty })
                  : tw("history.sent", { account: counterparty });
              return (
                <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{label}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {when.format(e.createdAt)}
                      {e.transaction.description ? ` · ${e.transaction.description}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${credit ? "text-brand" : "text-ink"}`}>
                    {credit ? "+" : "−"}
                    {formatMoney(credit ? e.amountMinor : -e.amountMinor, e.currency, tag)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
    </>
  );
}
