import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { logoutAction } from "@/app/actions";

const ITEMS = [
  ["dashboard", "/dashboard"],
  ["convert", "/convert"],
  ["cards", "/cards"],
  ["loans", "/loans"],
  ["requests", "/requests"],
  ["external", "/external"],
  ["crypto", "/crypto"],
] as const;

export type NavKey = (typeof ITEMS)[number][0] | "admin" | "queue";

/** Navigation shown at the top of every signed-in page. */
export default async function AppNav({ active, isAdmin }: { active: NavKey; isAdmin: boolean }) {
  const t = await getTranslations("App.nav");
  const link = (key: NavKey, href: string) => (
    <Link
      key={key}
      href={href as never}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm ${
        active === key ? "bg-brand text-white" : "text-ink-soft hover:bg-paper hover:text-ink"
      }`}
    >
      {t(key)}
    </Link>
  );
  return (
    <nav className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-5 py-2">
        {ITEMS.map(([key, href]) => link(key, href))}
        {isAdmin && link("admin", "/admin")}
        {isAdmin && link("queue", "/admin/requests")}
        <form action={logoutAction} className="ml-auto pl-3">
          <button type="submit" className="whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-sm">
            {t("logout")}
          </button>
        </form>
      </div>
    </nav>
  );
}
