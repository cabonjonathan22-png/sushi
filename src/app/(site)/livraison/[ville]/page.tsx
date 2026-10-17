import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconPin } from "@/components/site/icons";
import { ProductCard } from "@/components/site/ProductCard";
import { CtaBand, FaqList, PageHero, SectionHeading } from "@/components/site/Sections";
import { getI18n, type T } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { money } from "@/lib/money";
import { deliveryTowns, getSiteSettings, type DeliveryTown } from "@/lib/restaurants";
import { breadcrumbJsonLd, faqJsonLd, JsonLd, restaurantJsonLd } from "@/lib/seo";
import { getShowcase } from "@/lib/showcase";

/**
 * Page de référencement local, une par commune livrée (« Livraison à Cadenet »).
 * Contenu unique par commune : minimum, frais, délai, communes voisines, FAQ.
 */
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ ville: string }> };

async function findTown(slug: string) {
  return (await deliveryTowns()).find((x) => x.slug === slug) ?? null;
}

const minText = (z: DeliveryTown["zone"]) => (z.minLunchCents === z.minDinnerCents ? money(z.minLunchCents) : `${money(z.minLunchCents)} / ${money(z.minDinnerCents)}`);
const feeText = (z: DeliveryTown["zone"], t: T) =>
  z.feeCents ? `${t("checkout.zoneFee", { fee: money(z.feeCents) })}${z.freeFromCents ? `, ${t("town.freeFrom", { amount: money(z.freeFromCents) })}` : ""}` : t("checkout.zoneFree");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [town, s, { t }] = await Promise.all([findTown((await params).ville), getSiteSettings(), getI18n()]);
  if (!town) return {};
  const vars = { brand: s.brandName, city: town.city, postalCode: town.postalCodes.join(", ") };
  return {
    title: { absolute: t("town.metaTitle", vars) },
    description: t("town.metaDesc", { ...vars, min: minText(town.zone), fee: feeText(town.zone, t).toLowerCase() }),
    alternates: { canonical: `/livraison/${town.slug}` },
  };
}

export default async function TownPage({ params }: Props) {
  const town = await findTown((await params).ville);
  if (!town) notFound();
  const [towns, settings, config, { t, locale, defaultLocale }] = await Promise.all([deliveryTowns(), getSiteSettings(), getConfig(), getI18n()]);
  const { restaurant: r, zone: z } = town;
  const showcase = await getShowcase(r.id, locale, defaultLocale, 4);
  const postalCode = town.postalCodes.join(", ");
  const neighbours = towns.filter((x) => x.slug !== town.slug && x.zone.id === z.id);
  const others = towns.filter((x) => x.slug !== town.slug && x.zone.id !== z.id);
  const faq = [
    { q: t("faq.townMinQ", { city: town.city }), a: t("faq.townMinA", { lunch: money(z.minLunchCents), dinner: money(z.minDinnerCents), fee: `${feeText(z, t)}.` }) },
    { q: t("faq.townEtaQ", { city: town.city }), a: t("faq.townEtaA", { n: z.etaMinutes }) },
    { q: t("faq.advanceQ"), a: t("faq.advanceA") },
  ];
  const crumbs = [
    { href: "/", label: t("breadcrumb.home") },
    { href: "/livraison", label: t("delivery.title") },
    { href: `/livraison/${town.slug}`, label: town.city },
  ];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href })))} />
      <JsonLd data={faqJsonLd(faq)} />
      <JsonLd data={restaurantJsonLd(r, { cuisine: config.site.cuisine, country: config.region.country })} />

      <PageHero crumbs={crumbs} eyebrow={`${settings.brandName} · ${postalCode}`} title={t("town.title", { city: town.city })}
        text={t("town.intro", { brand: settings.brandName, city: town.city, postalCode, restaurant: `${r.name} (${r.city})` })}>
        <Link href={`/commander/${r.slug}`} className="btn-primary rounded-full px-7 text-lg">{t("town.order", { city: town.city })}</Link>
      </PageHero>

      <section className="wrap py-14">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            { label: t("town.minimum"), value: minText(z) },
            { label: t("town.fee"), value: feeText(z, t) },
            { label: t("town.eta"), value: t("delivery.eta", { n: z.etaMinutes }) },
          ].map((x) => (
            <div key={x.label} className="rounded-3xl bg-white p-6 ring-1 ring-line">
              <dt className="eyebrow">{x.label}</dt>
              <dd className="mt-3 font-display text-2xl first-letter:uppercase">{x.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {showcase.featured.length > 0 && (
        <section className="wrap pb-16" aria-labelledby="featured">
          <SectionHeading id="featured" eyebrow={t("home.featuredEyebrow")} title={t("home.featuredTitle")} action={{ href: `/commander/${r.slug}`, label: t("home.fullMenu") }} />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {showcase.featured.map(({ product, category }) => (
              <ProductCard key={product.id} product={product} href={`/commander/${r.slug}${category ? `#cat-${category}` : ""}`} badges={config.catalog.badges}
                fromLabel={(price) => t("menu.from", { price })} />
            ))}
          </div>
        </section>
      )}

      <section className="bg-white">
        <div className="wrap section-y grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <h2 className="text-3xl sm:text-4xl">{t("town.otherTowns")}</h2>
            <ul className="mt-6 flex flex-wrap gap-2">
              {[...neighbours, ...others].map((x) => (
                <li key={x.slug}>
                  <Link href={`/livraison/${x.slug}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-linen px-3.5 text-sm font-medium transition hover:bg-char hover:text-paper">
                    <IconPin className="h-3.5 w-3.5" />{x.city}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div><h2 className="mb-6 text-3xl sm:text-4xl">{t("faq.title")}</h2><FaqList items={faq} /></div>
        </div>
      </section>

      <div className="pt-16"><CtaBand title={t("home.ctaTitle")} text={t("home.ctaText")} href={`/commander/${r.slug}`} label={t("town.order", { city: town.city })} /></div>
    </>
  );
}
