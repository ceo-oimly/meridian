import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getCurrentUser } from "./session";

/** For signed-in pages: sets the locale, and sends visitors who are not signed in to the login page. */
export async function requireUserPage(locale: string) {
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });
  return user as NonNullable<typeof user>;
}

