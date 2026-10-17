import type { MetadataRoute } from "next";
import { deliveryTowns, listRestaurants } from "@/lib/restaurants";
import { appUrl } from "@/lib/seo";

export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const [restaurants, towns] = await Promise.all([listRestaurants(), deliveryTowns()]);
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/livraison`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    // Une page par commune livrée (référencement local « livraison à … »).
    ...towns.map((t) => ({ url: `${base}/livraison/${t.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...(restaurants.length > 1 ? [{ url: `${base}/restaurants`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 }] : []),
    ...restaurants.flatMap((r) => [
      { url: `${base}/restaurants/${r.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
      { url: `${base}/commander/${r.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 },
    ]),
    ...["/allergenes", "/mentions-legales", "/cgv", "/confidentialite", "/cookies"].map((p) => ({ url: `${base}${p}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
