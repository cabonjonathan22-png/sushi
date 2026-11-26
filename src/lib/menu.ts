import "server-only";
import type { CatalogProduct } from "./cart";
import { db } from "./db";
import { imageSources, type ImageFiles } from "./images";
import { offerAppliesToZone, offerValidAt, offerVisibleAt, offerWhen, toOfferRule, type OfferRule } from "./offer-rules";

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
  /** Produits de l'offre : prix habituel et prix pendant l'offre. */
  items: { productId: string; variantId: string | null; quantity: number; name: string; label: string; priceCents: number; regularPriceCents: number }[];
  /** Zones de livraison concernées (vide = partout). */
  zones: string[];
  /** Plateau à ajouter au panier (produit virtuel + contenu figé), ou null si simple annonce. */
  bundleId: string | null;
  optionIds: string[];
  image: { src: string; srcSet: string } | null;
  showOnHome: boolean;
  /** Valable en ce moment (sinon annoncée : le prix s'appliquera au créneau prévu). */
  today: boolean;
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

/** Offres annoncées dans ce restaurant, et si elles sont valables à ce moment (jours, période, horaires). */
async function announcedOffers(restaurantId: string, at: Date): Promise<{ rule: OfferRule; validNow: boolean }[]> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const all = (await db.offer.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(toOfferRule);
  return all.filter((o) => offerVisibleAt(o, at, restaurantId)).map((rule) => ({ rule, validNow: offerValidAt(rule, at, restaurantId, r?.timezone ?? "Europe/Paris") }));
}

/**
 * Menu au moment `at` (par défaut : maintenant). Pour une commande, `at` = début du créneau choisi :
 * l'offre du mardi s'applique à une commande pour mardi, même passée la veille.
 */
export async function loadMenu(restaurantId: string, opts: { includeHidden?: boolean; at?: Date; zoneId?: string | null; noOffers?: boolean } = {}): Promise<Menu> {
  // Offres annoncées → plateaux ; « validNow » : le créneau (ou maintenant) tombe pendant l'offre.
  const offers = opts.includeHidden || opts.noOffers ? [] : await announcedOffers(restaurantId, opts.at ?? new Date());
  const imagesForOffers = new Map((await db.image.findMany({ where: { id: { in: offers.flatMap((o) => (o.rule.imageId ? [o.rule.imageId] : [])) } } })).map((i) => [i.id, i.files as ImageFiles]));
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
  const bundles = opts.includeHidden || opts.noOffers ? [] : offerBundles(offers, byIdOf(menuProducts), imagesForOffers, opts);
  // Les offres apparaissent aussi dans la carte, en première catégorie « Offres du moment ».
  const offersCategory: MenuCategory[] = bundles.length
    ? [{ id: "offers", slug: "offres", name: "Offres du moment", description: "", kind: "STANDARD", productIds: bundles.map((b) => b.id) }]
    : [];
  return {
    categories: [...offersCategory, ...categories
      .map((c) => ({
        id: c.id, slug: c.slug, name: c.name, description: c.description, kind: c.kind,
        productIds: c.products.map((x) => x.productId).filter((id) => visibleIds.has(id)),
      }))
      .filter((c) => opts.includeHidden || c.productIds.length > 0)],
    products: [...orderable, ...bundles],
  };
}

const byIdOf = (list: MenuProduct[]) => new Map(list.map((p) => [p.id, p]));

/** Identifiant du « plateau » d'une offre dans le panier (produit virtuel). */
export const offerProductId = (offerId: string) => `offer_${offerId}`;

/**
 * Chaque offre avec des produits devient un plateau : une ligne de commande « Happy Box » au prix global,
 * dont le contenu (options figées, à 0 €) s'imprime sur le ticket. Les produits seuls gardent leur prix.
 * Disponible : à l'affichage (sans `at`), dès que l'offre est annoncée ; à la commande, seulement si le
 * créneau tombe pendant l'offre (et dans une de ses zones si elle en a).
 */
function offerBundles(
  offers: { rule: OfferRule; validNow: boolean }[],
  products: Map<string, MenuProduct>,
  images: Map<string, ImageFiles>,
  opts: { at?: Date; zoneId?: string | null },
): MenuProduct[] {
  return offers.flatMap(({ rule: o, validNow }) => {
    const parts = o.items.flatMap((i) => {
      const p = products.get(i.productId);
      if (!p) return [];
      const v = i.variantId ? p.variants.find((x) => x.id === i.variantId) : undefined;
      if (i.variantId && !v) return [];
      return [{ p, v, quantity: i.quantity, priceCents: i.priceCents }];
    });
    if (!parts.length || parts.length !== o.items.length) return [];
    const total = parts.reduce((a, x) => a + x.priceCents, 0);
    // Taux de TVA : celui des produits (le plus représenté en valeur si les taux diffèrent).
    const byRate = new Map<number, number>();
    for (const x of parts) byRate.set(x.p.vatRate, (byRate.get(x.p.vatRate) ?? 0) + x.priceCents);
    const vatRate = [...byRate.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const zoneOk = opts.zoneId === undefined || offerAppliesToZone(o, opts.zoneId);
    const active = (opts.at ? validNow : true) && zoneOk;
    const files = o.imageId ? images.get(o.imageId) : undefined;
    const first = parts[0]!.p;
    const content = parts.map((x) => `${x.quantity > 1 ? `${x.quantity} × ` : ""}${x.p.name}${x.v ? ` (${x.v.label})` : ""}`);
    const gid = `${offerProductId(o.id)}_g`;
    return [{
      id: offerProductId(o.id), slug: offerProductId(o.id), name: o.title, shortDescription: content.join(", "), description: o.description,
      priceCents: total, fromPriceCents: total, vatRate, active, outOfStock: parts.some((x) => x.p.outOfStock || x.v?.outOfStock),
      isAlcohol: parts.some((x) => x.p.isAlcohol), maxQuantity: null,
      availablePickup: true, availableDelivery: true, availableDineIn: true, categoryName: "Offres", isExtra: false,
      availableLunch: true, availableDinner: true, includedExtras: parts.reduce((a, x) => a + (x.p.includedExtras ?? 0), 0),
      variants: [],
      // Contenu du plateau : options obligatoires et figées (toutes cochées, 0 €).
      optionGroups: [{ id: gid, name: "Contenu", minSelect: parts.length, maxSelect: parts.length,
        options: content.map((name, i) => ({ id: `${gid}${i}`, name, priceDeltaCents: 0, active: true })) }],
      image: files ? imageSources(files, 320) : first.image, imageLarge: files ? imageSources(files, 640) : first.imageLarge,
      badges: [], allergens: [...new Set(parts.flatMap((x) => x.p.allergens))], categoryIds: [],
    }];
  });
}

/** Offres affichées sur le site en ce moment, avec leur prix et leur visuel. */
export async function currentOffers(restaurantId: string, at = new Date()): Promise<CurrentOffer[]> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const tz = r?.timezone ?? "Europe/Paris";
  // Offres annoncées (pas seulement celles valables à l'instant : « tous les mardis » s'affiche toute la semaine).
  const offers = (await db.offer.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }))
    .map(toOfferRule).filter((o) => offerVisibleAt(o, at, restaurantId));
  if (!offers.length) return [];
  // Prix habituels (menu sans offre) pour afficher « au lieu de ».
  const regular = await loadMenu(restaurantId, { at, noOffers: true });
  const byId = new Map(regular.products.map((p) => [p.id, p]));
  const imgIds = offers.flatMap((o) => (o.imageId ? [o.imageId] : []));
  const [imgRows, zones] = await Promise.all([
    db.image.findMany({ where: { id: { in: imgIds } } }),
    db.deliveryZone.findMany({ where: { id: { in: offers.flatMap((o) => o.zoneIds) } }, include: { areas: { select: { city: true } } } }),
  ]);
  const imgs = new Map(imgRows.map((i) => [i.id, i.files as ImageFiles]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return offers
    .map((o) => {
      // Produits retirés / masqués dans ce restaurant : ignorés.
      const items = o.items.flatMap((i) => {
        const p = byId.get(i.productId);
        if (!p) return [];
        const v = i.variantId ? p.variants.find((x) => x.id === i.variantId) : undefined;
        if (i.variantId && !v) return [];
        return [{ productId: p.id, variantId: v?.id ?? null, quantity: i.quantity, name: p.name, label: v?.label ?? "", priceCents: i.priceCents, regularPriceCents: (v?.priceCents ?? p.priceCents) * i.quantity }];
      });
      const first = items[0] ? byId.get(items[0].productId) : undefined;
      return {
        id: o.id, title: o.title, badge: o.badge, description: o.description, when: offerWhen(o, tz), items, showOnHome: o.showOnHome,
        bundleId: items.length && items.length === o.items.length ? offerProductId(o.id) : null,
        optionIds: items.map((_, i) => `${offerProductId(o.id)}_g${i}`),
        today: offerValidAt(o, at, restaurantId, tz),
        zones: o.zoneIds.flatMap((id) => zoneById.get(id)?.areas.map((a) => a.city) ?? []),
        image: o.imageId ? imageSources(imgs.get(o.imageId), 640) : (first?.imageLarge ?? null),
        _skip: o.items.length > 0 && items.length === 0,
      };
    })
    .filter((o) => !o._skip)
    .map(({ _skip, ...o }) => o);
}

export function catalogMap(menu: Menu): Map<string, CatalogProduct> {
  return new Map(menu.products.map((p) => [p.id, p]));
}
