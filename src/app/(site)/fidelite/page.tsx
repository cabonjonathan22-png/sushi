import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, PageHero } from "@/components/site/Sections";
import { translateTexts } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { getCustomer } from "@/lib/auth/session";
import { activeRewards, loyaltySettings } from "@/lib/loyalty";
import { money } from "@/lib/money";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("loyalty.title"), description: t("loyalty.pageIntro"), alternates: { canonical: "/fidelite" } };
}

/** Présentation publique de la carte de fidélité : fonctionnement et récompenses. */
export default async function LoyaltyPage() {
  const settings = await loyaltySettings();
  if (!settings.enabled) notFound();
  const [{ t, locale, defaultLocale }, rewards, customer] = await Promise.all([getI18n(), activeRewards(), getCustomer()]);
  // Noms des récompenses saisis dans la langue du restaurant : traduits pour le visiteur.
  const names = locale === defaultLocale ? null : await translateTexts("loyaltyReward", "all",
    Object.fromEntries(rewards.flatMap((r) => [[`${r.id}_name`, r.name], [`${r.id}_desc`, r.description]])), locale);
  const crumbs = [{ href: "/", label: t("breadcrumb.home") }, { href: "/fidelite", label: t("loyalty.title") }];
  const steps = [
    t("loyalty.how1", { per: settings.pointsPerEuro }),
    t("loyalty.how2"),
    t("loyalty.how3"),
  ];
  const describe = (r: (typeof rewards)[number]) =>
    r.type === "AMOUNT" ? t("loyalty.typeAmount", { amount: money(r.value) }) : r.type === "PERCENT" ? t("loyalty.typePercent", { percent: r.value }) : t("loyalty.typeProduct", { product: r.product?.name ?? r.name });

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href })))} />
      <PageHero crumbs={crumbs} title={t("loyalty.title")} text={t("loyalty.pageIntro")}>
        <Link href="/compte#fidelite" className="btn-primary rounded-full px-7">{customer ? t("loyalty.myCard") : t("loyalty.join")}</Link>
      </PageHero>

      <section className="wrap py-14" aria-labelledby="how">
        <h2 id="how" className="text-3xl sm:text-4xl">{t("loyalty.howTitle")}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="rounded-3xl bg-white p-7 ring-1 ring-line">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 font-display text-xl text-brand-700">{i + 1}</span>
              <p className="mt-4 leading-relaxed">{s}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          {settings.signupBonus > 0 && `${t("loyalty.bonus", { points: settings.signupBonus })} `}
          {settings.expiryMonths > 0 && t("loyalty.expiry", { months: settings.expiryMonths })}
        </p>
      </section>

      <section className="bg-white" aria-labelledby="rewards">
        <div className="wrap section-y">
          <h2 id="rewards" className="text-3xl sm:text-4xl">{t("loyalty.rewardsTitle")}</h2>
          {rewards.length === 0 ? <p className="mt-4 text-muted">{t("loyalty.noRewards")}</p> : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((r) => (
                <li key={r.id} className="flex flex-col rounded-3xl p-7 ring-1 ring-line">
                  <p className="font-display text-5xl leading-none">{r.pointsCost}<span className="ms-2 font-sans text-base text-muted">{t("loyalty.points")}</span></p>
                  <h3 className="mt-5 text-2xl">{names?.[`${r.id}_name`] ?? r.name}</h3>
                  <p className="mt-1 text-muted">{describe(r)}{r.minSubtotalCents > 0 && ` · ${t("loyalty.from", { amount: money(r.minSubtotalCents) })}`}</p>
                  {r.description && <p className="mt-3 text-sm text-muted">{names?.[`${r.id}_desc`] ?? r.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="pt-16"><CtaBand title={t("home.ctaTitle")} text={t("loyalty.pageIntro")} href="/commander" label={t("home.orderOnline")} /></div>
    </>
  );
}
