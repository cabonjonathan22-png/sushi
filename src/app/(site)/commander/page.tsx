import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RestaurantList } from "@/components/site/RestaurantList";
import { PageHero } from "@/components/site/Sections";
import { getI18n } from "@/i18n/server";
import { listRestaurants } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Commander en ligne", alternates: { canonical: "/commander" } };
export const dynamic = "force-dynamic";

/** Choix du restaurant : direct s'il n'y en a qu'un, ou si le client en a déjà choisi un. */
export default async function ChooseRestaurant({ searchParams }: { searchParams: Promise<{ choisir?: string }> }) {
  const restaurants = await listRestaurants();
  if (restaurants.length === 1) redirect(`/commander/${restaurants[0]!.slug}`);
  const remembered = (await cookies()).get("ys_resto")?.value;
  if (!(await searchParams).choisir && remembered && restaurants.some((r) => r.slug === remembered)) redirect(`/commander/${remembered}`);

  const { t } = await getI18n();
  return (
    <>
      <PageHero crumbs={[{ href: "/", label: t("breadcrumb.home") }, { href: "/commander", label: t("nav.order") }]} title={t("choose.title")} />
      <div className="wrap py-14">
        {restaurants.length === 0 && <p>{t("choose.none")}</p>}
        <RestaurantList restaurants={restaurants} hrefFor={(slug) => `/commander/${slug}`} cta={t("nav.order")} />
      </div>
    </>
  );
}
