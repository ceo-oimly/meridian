import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["en", "ko"],
  defaultLocale: "en",
  // Detects the browser's Accept-Language header on first visit and remembers the choice in a cookie.
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);

/** BCP-47 tag used for Intl formatting (dates, currency). */
export const INTL_TAG: Record<Locale, string> = {
  en: "en-US",
  ko: "ko-KR",
};

/** Default display currency per locale; users can still hold both wallets. */
export const DEFAULT_CURRENCY: Record<Locale, "USD" | "KRW"> = {
  en: "USD",
  ko: "KRW",
};
