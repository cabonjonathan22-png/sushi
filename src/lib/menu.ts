import "server-only";
import type { CatalogProduct } from "./cart";
import { db } from "./db";
import { imageSources, type ImageFiles } from "./images";

/**
 * Menu d'un restaurant : catalogue commun + surcharges du restaurant
 * (actif / prix / rupture), prêt pour l'affichage ET pour le calcul du panier.
 */

export interface MenuProduct extends CatalogProduct {
  slug: string;
  shortDescription: string;
  description: string;
  image: { src: string; srcSet: string } | null;
  imageLarge: { src: string; srcSet: string } | null;
  badges: string[];
  allergens: string[];
  categoryIds: string[];
  /** Prix « à partir de » quand il y a des variantes. */
  fromPriceCents: number;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "STANDARD" | "EXTRAS";
  productIds: string[];
}

export interface Menu {
  categories: MenuCategory[];
  products: MenuProduct[];
}

export async function loadMenu(restaurantId: string, opts: { includeHidden?: boolean } = {}): Promise<Menu> {
  const [categories, products, overrides, variantOverrides] = await Promise.all([
    db.category.findMany({
      // Catégorie visible au catalogue ET non masquée dans ce restaurant.
      where: opts.includeHidden ? {} : { visible: true, restaurants: { none: { restaurantId, visible: false } } },
      orderBy: { sortOrder: "asc" },
      include: { products: { orderBy: { sortOrder: "asc" }, select: { productId: true } } },
    }),
    db.product.findMany({
      where: { archived: false, ...(opts.includeHidden ? {} : { active: true }) },
      include: {
        categories: { include: { category: { select: { name: true, sortOrder: true, kind: true } } } },
        variants: { orderBy: { sortOrder: "asc" } },
        optionGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.restaurantProduct.findMany({ where: { restaurantId } }),
    db.restaurantVariant.findMany({ where: { restaurantId } }),
  ]);

  const imageIds = [...new Set(products.flatMap((p) => (p.imageId ? [p.imageId] : [])))];
  const images = new Map((await db.image.findMany({ where: { id: { in: imageIds } } })).map((i) => [i.id, i.files as ImageFiles]));
  const ovr = new Map(overrides.map((o) => [o.productId, o]));
  const vOvr = new Map(variantOverrides.map((o) => [o.variantId, o]));

  const menuProducts: MenuProduct[] = [];
  for (const p of products) {
    const o = ovr.get(p.id);
    if (!opts.includeHidden && o && !o.active) continue; // désactivé dans ce restaurant
    const variants = p.variants
      .map((v) => {
        const vo = vOvr.get(v.id);
        return {
          id: v.id,
          label: v.label,
          priceCents: vo?.priceCents ?? v.priceCents,
          active: v.active && (vo?.active ?? true),
          outOfStock: vo?.outOfStock ?? false,
        };
      })
      .filter((v) => opts.includeHidden || v.active);
    const priceCents = o?.priceCents ?? p.priceCents;
    const files = p.imageId ? images.get(p.imageId) : undefined;
    const firstCat = [...p.categories].sort((a, b) => a.category.sortOrder - b.category.sortOrder)[0];
    menuProducts.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      priceCents,
      fromPriceCents: variants.length ? Math.min(...variants.map((v) => v.priceCents)) : priceCents,
      vatRate: p.vatRate,
      active: p.active && (o?.active ?? true),
      outOfStock: (o?.outOfStock ?? false) || (variants.length > 0 && variants.every((v) => v.outOfStock)),
      isAlcohol: p.isAlcohol,
      maxQuantity: p.maxQuantity,
      availablePickup: p.availablePickup,
      availableDelivery: p.availableDelivery,
      availableDineIn: p.availableDineIn,
      categoryName: firstCat?.category.name ?? "",
      isExtra: p.categories.some((c) => c.category.kind === "EXTRAS"),
      availableLunch: p.availableLunch,
      availableDinner: p.availableDinner,
      includedExtras: p.includedExtras,
      variants,
      optionGroups: p.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.filter((x) => opts.includeHidden || x.active).map((x) => ({ id: x.id, name: x.name, priceDeltaCents: x.priceDeltaCents, active: x.active })),
      })),
      image: imageSources(files, 320),
      imageLarge: imageSources(files, 640),
      badges: p.badges,
      allergens: p.allergens,
      categoryIds: p.categories.map((c) => c.categoryId),
    });
  }

  // Un plat dont aucune catégorie n'est affichée dans ce restaurant n'y est pas commandable.
  const shownCategories = new Set(categories.map((c) => c.id));
  const orderable = opts.includeHidden ? menuProducts : menuProducts.filter((p) => p.categoryIds.some((id) => shownCategories.has(id)));
  const visibleIds = new Set(orderable.map((p) => p.id));
  return {
    categories: categories
      .map((c) => ({
        id: c.id, slug: c.slug, name: c.name, description: c.description, kind: c.kind,
        productIds: c.products.map((x) => x.productId).filter((id) => visibleIds.has(id)),
      }))
      .filter((c) => opts.includeHidden || c.productIds.length > 0),
    products: orderable,
  };
}

export function catalogMap(menu: Menu): Map<string, CatalogProduct> {
  return new Map(menu.products.map((p) => [p.id, p]));
}
