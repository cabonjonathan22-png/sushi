import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderMenu } from "@/components/order/OrderMenu";
import { translateMenu } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { loadMenu } from "@/lib/menu";
import { getPublicRestaurant, getSiteSettings, listRestaurants } from "@/lib/restaurants";
import { appUrl, JsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic"; // ruptures et pauses en temps réel

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getPublicRestaurant((await params).slug);
  if (!r) return {};
  const [{ t }, c] = await Promise.all([getI18n(), getConfig()]);
  return {
    title: `${t("nav.menu")} ${r.name} ${r.city}`,
    description: `${t("nav.menu")} ${r.name} (${c.site.cuisine}), ${r.city} — ${t("home.orderOnline")} : ${[r.services.PICKUP && t("home.pickup"), r.services.DELIVERY && t("home.delivery")].filter(Boolean).join(", ").toLowerCase()}.`,
    alternates: { canonical: `/commander/${r.slug}` },
  };
}

export default async function OrderPage({ params }: Props) {
  const { slug } = await params;
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant) notFound();
  const [original, settings, all, config, { locale, defaultLocale }] = await Promise.all([loadMenu(restaurant.id), getSiteSettings(), listRestaurants(), getConfig(), getI18n()]);
  // Menu dans la langue du visiteur (traduction automatique mise en cache, corrigeable).
  const { menu, translated } = locale === defaultLocale ? { menu: original, translated: false } : await translateMenu(original, locale);
  const { stripePublishableKey: _pk, ...publicRestaurant } = restaurant;

  // Données structurées « Menu » (référencement).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${appUrl()}/commander/${restaurant.slug}#menu`,
    inLanguage: locale,
    name: `Menu ${restaurant.name}`,
    url: `${appUrl()}/commander/${restaurant.slug}`,
    hasMenuSection: menu.categories.map((c) => ({
      "@type": "MenuSection",
      name: c.name,
      hasMenuItem: c.productIds.slice(0, 50).map((id) => {
        const p = menu.products.find((x) => x.id === id)!;
        return {
          "@type": "MenuItem",
          name: p.name,
          description: p.shortDescription || undefined,
          offers: { "@type": "Offer", price: (p.fromPriceCents / 100).toFixed(2), priceCurrency: config.region.currency },
          ...(p.badges.includes("VEGETARIAN") ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
        };
      }),
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <OrderMenu restaurant={publicRestaurant} categories={menu.categories} products={menu.products} extrasLabel={settings.extrasLabel} multiRestaurant={all.length > 1} badges={config.catalog.badges}
        searchExamples={config.site.searchPlaceholder} extrasHint={config.site.extrasHint} translated={translated} />
    </>
  );
}
