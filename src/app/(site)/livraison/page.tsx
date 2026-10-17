import type { Metadata } from "next";
import Link from "next/link";
import { IconClock, IconPin } from "@/components/site/icons";
import { CtaBand, PageHero } from "@/components/site/Sections";
import { getI18n } from "@/i18n/server";
import { money } from "@/lib/money";
import { citySlug, getPublicRestaurant, getSiteSettings, listRestaurants } from "@/lib/restaurants";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export async function generateMetadata(): Promise<Metadata> {
  const [rs, s, { t }] = await Promise.all([listRestaurants().then((l) => Promise.all(l.map((r) => getPublicRestaurant(r.slug)))), getSiteSettings(), getI18n()]);
  const cities = [...new Set(rs.flatMap((r) => r?.zones.flatMap((z) => z.areas.map((a) => a.city)) ?? []))];
  return {
    title: `${t("delivery.title")} ${s.brandName}`,
    description: `${t("delivery.title")} ${s.brandName} : ${cities.slice(0, 10).join(", ")}${cities.length > 10 ? "…" : ""}. ${t("delivery.intro")}`.slice(0, 160),
    alternates: { canonical: "/livraison" },
  };
}

export default async function DeliveryPage() {
  const { t } = await getI18n();
  const restaurants = (await Promise.all((await listRestaurants()).map((r) => getPublicRestaurant(r.slug)))).filter((r) => r?.services.DELIVERY);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: t("breadcrumb.home"), path: "/" }, { name: t("delivery.title"), path: "/livraison" }])} />
      <PageHero crumbs={[{ href: "/", label: t("breadcrumb.home") }, { href: "/livraison", label: t("delivery.title") }]} title={t("delivery.title")} text={t("delivery.intro")} />
      <div className="wrap py-14 sm:py-20">
        {restaurants.map((r) => r && (
          <section key={r.id} className="mb-16 last:mb-0">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-3xl sm:text-4xl">{t("delivery.from", { name: r.name, city: r.city })}</h2>
              <Link href={`/commander/${r.slug}`} className="btn-primary rounded-full px-6">{t("delivery.order")}</Link>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {r.zones.map((z) => (
                <article key={z.id} className="rounded-3xl bg-white p-7 ring-1 ring-line">
                  <h3 className="text-2xl">{z.name}</h3>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-muted">{t("town.minimum")}</dt><dd className="mt-1 font-semibold">{t("delivery.minimum", { lunch: money(z.minLunchCents), dinner: money(z.minDinnerCents) })}</dd></div>
                    <div>
                      <dt className="text-muted">{t("town.fee")}</dt>
                      <dd className="mt-1 font-semibold">
                        {z.feeCents ? `${money(z.feeCents)}${z.freeFromCents ? ` · ${t("town.freeFrom", { amount: money(z.freeFromCents) })}` : ""}` : t("checkout.zoneFree")}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted"><IconClock className="h-4 w-4 text-gold" />{t("delivery.eta", { n: z.etaMinutes })}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {[...new Map(z.areas.map((a) => [a.city, a])).values()].map((a) => (
                      <li key={a.city}>
                        <Link href={`/livraison/${citySlug(a.city)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-linen px-3.5 text-sm font-medium transition hover:bg-char hover:text-paper">
                          <IconPin className="h-3.5 w-3.5" />{a.city} <span className="opacity-60">{a.postalCode}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ))}
        <p className="mt-12 text-muted">{t("delivery.notListed")}</p>
      </div>
      <CtaBand title={t("home.ctaTitle")} text={t("home.ctaText")} href="/commander" label={t("home.orderOnline")} />
    </>
  );
}
