import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="site-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-8xl italic text-brand-600">404</p>
      <h1 className="text-4xl">{t("notFound.title")}</h1>
      <p className="text-muted">{t("notFound.text")}</p>
      <div className="mt-2 flex gap-3">
        <Link href="/" className="btn-ghost">{t("notFound.home")}</Link>
        <Link href="/commander" className="btn-primary">{t("nav.order")}</Link>
      </div>
    </div>
  );
}
