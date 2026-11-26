import "server-only";
import type { CatalogProduct } from "./cart";
import { db } from "./db";
import { imageSources, type ImageFiles } from "./images";
import { offerValidAt, offerWhen, type OfferRule } from "./offer-rules";

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
  /** Offre du moment appliquée à ce produit (prix barré = prix habituel). */
  offer?: { title: string; badge: string; regularPriceCents: number } | null;
}

/** Offre du moment affichée sur le site (bandeau / accueil). */
export interface CurrentOffer {
  id: string;
  title: string;
  badge: string;
  description: string;
  when: string;
  productId: string | null;
  priceCents: number | null;
  regularPriceCents: number | null;
  image: { src: string; srcSet: string } | null;
  showOnHome: boolean;
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

/** Offres valables à ce moment dans ce restaurant (jours, période, horaires). */
async function validOffers(restaurantId: string, at: Date): Promise<OfferRule[]> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const all = await db.offer.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return all.filter((o) => offerValidAt(o, at, restaurantId, r?.timezone ?? "Europe/Paris"));
}

/**
 * Menu au moment `at` (par défaut : maintenant). Pour une commande, `at` = début du créneau choisi :
 * l'offre du mardi s'applique à une commande pour mardi, même passée la veille.
 */
export async function loadMenu(restaurantId: string, opts: { includeHidden?: boolean; at?: Date } = {}): Promise<Menu> {
  const offers = opts.includeHidden ? [] : await validOffers(restaurantId, opts.at ?? new Date());
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
    let priceCents = o?.priceCents ?? p.priceCents;
    // Offre du moment : prix spécial sur le produit (ou sur une de ses variantes).
    const offer = offers.find((x) => x.productId === p.id && x.priceCents !== null);
    let offerInfo: MenuProduct["offer"] = null;
    if (offer) {
      const v = offer.variantId ? variants.find((x) => x.id === offer.variantId) : null;
      if (v) {
        offerInfo = { title: offer.title, badge: offer.badge, regularPriceCents: v.priceCents };
        v.priceCents = offer.priceCents!;
      } else if (!offer.variantId) {
        offerInfo = { title: offer.title, badge: offer.badge, regularPriceCents: priceCents };
        priceCents = offer.priceCents!;
      }
    }
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
      offer: offerInfo,
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

/** Offres affichées sur le site en ce moment, avec leur prix et leur visuel. */
export async function currentOffers(restaurantId: string, at = new Date()): Promise<CurrentOffer[]> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const tz = r?.timezone ?? "Europe/Paris";
  const offers = await validOffers(restaurantId, at);
  if (!offers.length) return [];
  const menu = await loadMenu(restaurantId, { at });
  const byId = new Map(menu.products.map((p) => [p.id, p]));
  const imgIds = offers.flatMap((o) => (o.imageId ? [o.imageId] : []));
  const imgs = new Map((await db.image.findMany({ where: { id: { in: imgIds } } })).map((i) => [i.id, i.files as ImageFiles]));
  return offers
    // Produit retiré / masqué dans ce restaurant : l'offre ne s'affiche pas.
    .filter((o) => !o.productId || byId.has(o.productId))
    .map((o) => {
      const p = o.productId ? byId.get(o.productId) : undefined;
      const v = p && o.variantId ? p.variants.find((x) => x.id === o.variantId) : undefined;
      return {
        id: o.id, title: o.title, badge: o.badge, description: o.description, when: offerWhen(o, tz),
        productId: o.productId, showOnHome: o.showOnHome,
        priceCents: o.priceCents !== null && p ? (v?.priceCents ?? p.priceCents) : o.priceCents,
        regularPriceCents: p?.offer?.regularPriceCents ?? null,
        image: o.imageId ? imageSources(imgs.get(o.imageId), 640) : (p?.imageLarge ?? null),
      };
    });
}

export function catalogMap(menu: Menu): Map<string, CatalogProduct> {
  return new Map(menu.products.map((p) => [p.id, p]));
}
