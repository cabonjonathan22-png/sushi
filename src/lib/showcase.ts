import "server-only";
import { cache } from "react";
import { translateMenu } from "@/i18n/content";
import { loadMenu, type MenuProduct } from "./menu";

export interface ShowcaseCategory {
  slug: string;
  name: string;
  count: number;
  image: { src: string; srcSet: string } | null;
}

/**
 * Vitrine de la page d'accueil et des pages communes :
 * - « Nos incontournables » : produits portant le badge Populaire ou Coup de cœur
 *   (réglable produit par produit), sinon le premier plat de chaque catégorie ;
 * - les catégories de la carte, illustrées par leur premier plat.
 */
export const getShowcase = cache(async (restaurantId: string, locale: string, defaultLocale: string, max = 8) => {
  const original = await loadMenu(restaurantId);
  const { menu } = locale === defaultLocale ? { menu: original } : await translateMenu(original, locale);
  const byId = new Map(menu.products.map((p) => [p.id, p]));
  const standard = menu.categories.filter((c) => c.kind === "STANDARD" && c.productIds.length > 0);
  const orderable = (p: MenuProduct | undefined): p is MenuProduct => !!p && !p.outOfStock && !p.isAlcohol;

  const tagged = standard.flatMap((c) => c.productIds.map((id) => byId.get(id))).filter(orderable)
    .filter((p) => p.badges.includes("POPULAR") || p.badges.includes("CHEF"));
  const firstOfEach = standard.map((c) => c.productIds.map((id) => byId.get(id)).find((p) => orderable(p) && p.image)).filter(orderable);
  const catOf = new Map<string, string>();
  for (const c of standard) for (const id of c.productIds) if (!catOf.has(id)) catOf.set(id, c.slug);
  // Chaque plat mène à sa catégorie dans la carte (ancre #cat-…).
  const featured = [...new Map([...tagged, ...firstOfEach].map((p) => [p.id, p])).values()].slice(0, max)
    .map((product) => ({ product, category: catOf.get(product.id) ?? "" }));

  const categories: ShowcaseCategory[] = standard.map((c) => ({
    slug: c.slug,
    name: c.name,
    count: c.productIds.length,
    image: c.productIds.map((id) => byId.get(id)?.image).find(Boolean) ?? null,
  }));
  return { featured, categories };
});
