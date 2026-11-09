import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect, INTL_TAG, type Locale } from "@/i18n/routing";
import { getAdmin } from "@/lib/admin";
import { searchCustomers, recentAdminActivity } from "@/lib/ledgerService";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { AdjustForm, StatusForm } from "@/components/AdminForms";
import AppNav from "@/components/AppNav";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Not an admin (or not signed in): send them to the normal dashboard.
  const admin = await getAdmin();
  if (!admin) redirect({ href: "/dashboard", locale });
  if (!admin) return null;

  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";

  const t = await getTranslations("Admin");
  const tw = await getTranslations("Wallet");
  const tag = INTL_TAG[locale as Locale] ?? "en-US";
  const when = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });

  const [customers, activity] = await Promise.all([searchCustomers(q), recentAdminActivity()]);

  return (
    <>
    <AppNav active="admin" isAdmin />
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        <Link href="/dashboard" className="rounded-full border border-line bg-card px-4 py-2 text-sm">
          {t("back")}
        </Link>
      </div>

      <form method="get" className="mt-8 flex gap-3">
        <label className="sr-only" htmlFor="q">{t("searchLabel")}</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-md rounded-lg border border-line bg-card px-3 py-2"
        />
        <button type="submit" className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white">
          {t("search")}
        </button>
      </form>

      <section className="mt-8 space-y-6">
        {customers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line bg-card p-8 text-ink-soft">{t("noResults")}</p>
        )}

        {customers.map((c) => (
          <article key={c.id} className="rounded-2xl border border-line bg-card p-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-semibold">{c.fullName}</h2>
                <p className="text-sm text-ink-soft">{c.email}</p>
              </div>
              <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium">{t(`roles.${c.role}`)}</span>
            </header>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              {c.accounts.map((a) => (
                <div key={a.id} className="space-y-4">
                  <div className="rounded-xl bg-brand p-4 text-white">
                    <div className="flex items-center justify-between text-sm text-white/70">
                      <span>{a.currency}</span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{tw(`status.${a.status}`)}</span>
                    </div>
                    <p className="mt-1 font-display text-3xl">
                      {formatMoney(a.balanceMinor, a.currency as CurrencyCode, tag)}
                    </p>
                    <p className="mt-2 text-xs text-white/70">
                      {tw("accountNumber")}: <span className="font-mono text-white">{a.accountNumber}</span>
                    </p>
                    {a.statusReason && <p className="mt-1 text-xs text-white/70">{a.statusReason}</p>}
                  </div>

                  {c.id === admin.id ? (
                    <p className="rounded-lg bg-paper p-3 text-xs text-ink-soft">{t("selfNote")}</p>
                  ) : (
                    <>
                      <AdjustForm accountId={a.id} />
                      <StatusForm accountId={a.id} current={a.status} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">{t("activity.title")}</h2>
        {activity.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-card p-6 text-ink-soft">
            {t("activity.empty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
            {activity.map((l) => {
              const m = (l.metadata ?? {}) as Record<string, string>;
              const kind = l.action === "admin.status" ? "status" : "adjust";
              const detail =
                kind === "status"
                  ? `${tw(`status.${m.from}` as never)} → ${tw(`status.${m.to}` as never)}`
                  : `${m.direction === "debit" ? "−" : "+"}${formatMoney(BigInt(m.amountMinor ?? "0"), (m.currency ?? "USD") as CurrencyCode, tag)}`;
              return (
                <li key={l.id} className="px-5 py-4 text-sm">
                  <p className="font-medium">
                    {t(`activity.${kind}`)} · {detail}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {when.format(l.createdAt)}
                    {l.actorEmail ? ` · ${t("activity.by", { email: l.actorEmail })}` : ""}
                    {m.reason ? ` · ${m.reason}` : ""}
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
