import { useTranslations } from "next-intl";

// Always visible: this is a fictional portfolio project and no real money is involved.
export default function DemoBanner() {
  const t = useTranslations("Demo");
  return (
    <div role="note" className="bg-ink px-4 py-2 text-center text-xs font-medium text-paper">
      {t("banner")}
    </div>
  );
}
