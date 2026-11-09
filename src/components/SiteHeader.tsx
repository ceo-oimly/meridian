import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import LanguageSwitcher from "./LanguageSwitcher";

export default function SiteHeader() {
  const t = useTranslations("Nav");
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold text-brand">
          <span aria-hidden className="inline-block h-6 w-6 rounded-full bg-brand ring-4 ring-accent/40" />
          Meridian
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <LanguageSwitcher />
          <Link href="/login" className="text-ink-soft hover:text-ink">
            {t("login")}
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
          >
            {t("signup")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
