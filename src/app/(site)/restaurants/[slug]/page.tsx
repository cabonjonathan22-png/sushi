import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconBag, IconClock, IconPhone, IconPin, IconScooter, IconTable } from "@/components/site/icons";
import { ProductCard } from "@/components/site/ProductCard";
import { CtaBand, PageHero, SectionHeading } from "@/components/site/Sections";
import { hoursSummary, telHref } from "@/components/site/SiteChrome";
import { translateTexts } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { citySlug, getPublicRestaurant, heroImage } from "@/lib/restaurants";
import { breadcrumbJsonLd, JsonLd, restaurantJsonLd } from "@/lib/seo";
import { getShowcase } from "@/lib/showcase";

export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [r, c, { t }] = await Promise.all([getPublicRestaurant((await params).slug), getConfig(), getI18n()]);
  if (!r) return {};
  const services = [r.services.DINE_IN && t("home.dineIn"), r.services.PICKUP && t("home.pickup"), r.services.DELIVERY && t("home.delivery")].filter(Boolean).join(", ").toLowerCase();
  return {
    title: `${r.name} ${r.city}${c.site.cuisine ? ` — ${c.site.cuisine}` : ""}`,
    description: `${r.name}, ${r.street}, ${r.postalCode} ${r.city}. ${services ? `${t("home.orderOnline")} : ${services}.` : ""} ${r.phones[0] ?? ""}`.trim().slice(0, 160),
    alternates: { canonical: `/restaurants/${r.slug}` },
  };
}

export default async function RestaurantPage({ params }: Props) {
  const r = await getPublicRestaurant((await params).slug);
  if (!r) notFound();
  const [{ t, locale, defaultLocale }, config, hero] = await Promise.all([getI18n(), getConfig(), heroImage(1280)]);
  const country = config.region.country;
  const description = r.description && locale !== defaultLocale
    ? (await translateTexts("restaurant", r.id, { description: r.description }, locale)).description
    : r.description;
  const showcase = await getShowcase(r.id, locale, defaultLocale, 4);
  const dates = r.closures
    .map((c) => (c.startDate === c.endDate ? c.startDate : `${c.startDate} → ${c.endDate}`).replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2"))
    .join(", ");
  const crumbs = [{ href: "/", label: t("breadcrumb.home") }, { href: `/restaurants/${r.slug}`, label: r.name }];
  const cities = [...new Set(r.zones.flatMap((z) => z.areas.map((a) => a.city)))];
  const services = [
    { on: r.services.DINE_IN, icon: IconTable, label: t("home.dineIn") },
    { on: r.services.PICKUP, icon: IconBag, label: t("home.pickup") },
    { on: r.services.DELIVERY, icon: IconScooter, label: t("home.delivery") },
  ].filter((s) => s.on);

  return (
    <>
      <JsonLd data={restaurantJsonLd(r, { image: hero?.src, cuisine: config.site.cuisine, country })} />
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href })))} />
      <PageHero crumbs={crumbs} eyebrow={config.site.cuisine} title={`${r.name} — ${r.city}`} text={description || `${r.street}, ${r.postalCode} ${r.city}`}>
        <Link href={`/commander/${r.slug}`} className="btn-primary rounded-full px-7">{t("restaurant.orderOnline")}</Link>
        {r.phones[0] && <a href={telHref(r.phones[0], country)} className="btn rounded-full border border-char/20 px-6 text-char hover:bg-white"><IconPhone className="h-4 w-4" />{r.phones[0]}</a>}
      </PageHero>

      <section className="wrap grid gap-5 py-14 lg:grid-cols-3">
        <article className="rounded-3xl bg-white p-7 ring-1 ring-line">
          <h2 className="flex items-center gap-2 text-2xl"><IconPin className="h-5 w-5 text-gold" />{t("home.address")}</h2>
          <address className="mt-4 not-italic leading-relaxed">{r.street}<br />{r.postalCode} {r.city}</address>
          <p className="mt-3 flex flex-col">{r.phones.map((p) => <a key={p} href={telHref(p, country)} className="font-semibold hover:underline">{p}</a>)}</p>
          {r.email && <p className="mt-2"><a href={`mailto:${r.email}`} className="text-muted hover:underline">{r.email}</a></p>}
          {r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noopener" className="btn-ghost mt-5 min-h-10 rounded-full border-line px-5 text-sm">{t("restaurant.directions")}</a>}
        </article>
        <article className="rounded-3xl bg-white p-7 ring-1 ring-line">
          <h2 className="flex items-center gap-2 text-2xl"><IconClock className="h-5 w-5 text-gold" />{t("restaurant.hours")}</h2>
          <ul className="mt-4 space-y-3">{hoursSummary(r.hours, t, locale).map((g) => <li key={g.days}><strong className="font-semibold">{g.days}</strong><br /><span className="text-muted">{g.ranges}</span></li>)}</ul>
          {dates && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{t("restaurant.closures", { dates })}</p>}
        </article>
        <article className="rounded-3xl bg-white p-7 ring-1 ring-line">
          <h2 className="text-2xl">{t("restaurant.services")}</h2>
          <ul className="mt-4 space-y-3">
            {services.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon /></span>{label}</li>
            ))}
          </ul>
          {r.services.DELIVERY && cities.length > 0 && (
            <p className="mt-5 text-sm leading-relaxed text-muted">
              {t("home.deliveredTowns", { towns: "" })}
              {cities.map((city, i) => <span key={city}><Link href={`/livraison/${citySlug(city)}`} className="font-medium text-char hover:underline">{city}</Link>{i < cities.length - 1 ? ", " : "."}</span>)}
            </p>
          )}
        </article>
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

      <CtaBand title={t("home.ctaTitle")} text={t("home.ctaText")} href={`/commander/${r.slug}`} label={t("restaurant.orderOnline")} />
    </>
  );
}
