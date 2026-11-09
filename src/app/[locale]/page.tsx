import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

const FEATURES = ["wallets", "transfers", "history", "control"] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-soft">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-dark"
            >
              {t("cta")}
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-line bg-card px-6 py-3 font-medium text-ink transition hover:border-brand"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>

        {/* Decorative balance card */}
        <div aria-hidden className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-accent/20 blur-2xl" />
          <div className="relative rounded-3xl bg-brand p-8 text-white shadow-2xl">
            <p className="text-sm text-white/70">USD</p>
            <p className="mt-1 font-display text-4xl">$12,480.50</p>
            <div className="my-6 h-px bg-white/20" />
            <p className="text-sm text-white/70">KRW</p>
            <p className="mt-1 font-display text-4xl">₩3,250,000</p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold">{t("features.title")}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((key) => (
              <div key={key} className="rounded-2xl border border-line bg-paper p-6">
                <h3 className="font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-ink-soft">{t(`features.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <h2 className="font-display text-3xl font-semibold">{t("security.title")}</h2>
        <p className="mt-4 text-ink-soft">{t("security.body")}</p>
      </section>
    </>
  );
}
