import type { Metadata } from "next";
import { RestaurantList } from "@/components/site/RestaurantList";
import { PageHero } from "@/components/site/Sections";
import { getI18n } from "@/i18n/server";
import { getSiteSettings, listRestaurants } from "@/lib/restaurants";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [{ t }, s, list] = await Promise.all([getI18n(), getSiteSettings(), listRestaurants()]);
  return {
    title: `${t("restaurants.title")} ${s.brandName}`,
    description: `${t("restaurants.intro")} ${list.map((r) => r.city).join(", ")}.`.slice(0, 160),
    alternates: { canonical: "/restaurants" },
  };
}

export default async function RestaurantsPage() {
  const [{ t }, list] = await Promise.all([getI18n(), listRestaurants()]);
  const crumbs = [{ href: "/", label: t("breadcrumb.home") }, { href: "/restaurants", label: t("restaurants.title") }];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href })))} />
      <PageHero crumbs={crumbs} title={t("restaurants.title")} text={t("restaurants.intro")} />
      <div className="wrap py-14 sm:py-20">
        <RestaurantList restaurants={list} hrefFor={(slug) => `/restaurants/${slug}`} cta={t("home.viewRestaurant")} />
      </div>
    </>
  );
}
