import { allocate, money, vatBreakdown, type VatLine } from "./money";
import { rewardDiscount, rewardProblem, type RewardProblem, type RewardRule } from "./loyalty-rules";
import { deliveryFee, minimumFor, missingForMinimum, type Period, type ZoneRule } from "./zones";

/**
 * Calcul du panier — TOUJOURS exécuté côté serveur à la validation.
 * Les prix envoyés par le navigateur sont ignorés : seuls les identifiants
 * (produit, variante, options) et les quantités sont pris en compte.
 * Fonction pure (sans base de données) : testée unitairement.
 */

export type Mode = "PICKUP" | "DELIVERY" | "DINE_IN";

export interface CatalogOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  active: boolean;
}

export interface CatalogOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: CatalogOption[];
}

export interface CatalogVariant {
  id: string;
  label: string;
  priceCents: number;
  active: boolean;
  outOfStock: boolean;
}

/** Produit tel que vendu par un restaurant donné (surcharges déjà appliquées). */
export interface CatalogProduct {
  id: string;
  name: string;
  priceCents: number;
  vatRate: number;
  active: boolean;
  outOfStock: boolean;
  isAlcohol: boolean;
  maxQuantity: number | null;
  availablePickup: boolean;
  availableDelivery: boolean;
  availableDineIn: boolean;
  categoryName: string;
  variants: CatalogVariant[];
  optionGroups: CatalogOptionGroup[];
  /** Produit de la catégorie « petits plus » (sauces, wasabi, baguettes…). */
  isExtra?: boolean;
  /** Nombre de « petits plus » offerts avec chaque exemplaire de ce produit. */
  includedExtras?: number;
  /** Proposé le midi / le soir (absent = oui). */
  availableLunch?: boolean;
  availableDinner?: boolean;
}

export interface CartLineInput {
  productId: string;
  variantId?: string | null;
  optionIds?: string[];
  quantity: number;
}

export interface PromoRule {
  code: string;
  type: "AMOUNT" | "PERCENT" | "FREE_DELIVERY";
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  restaurantIds: string[];
}

export interface PricingContext {
  restaurantId: string;
  mode: Mode;
  period: Period;
  /** Zone trouvée pour l'adresse (obligatoire en livraison). */
  zone: ZoneRule | null;
  pickupMinimumCents: number;
  noAlcoholDelivery: boolean;
  promo: PromoRule | null;
  now: Date;
  /** Quantité maximum par ligne (Configuration ; défaut 50). */
  maxLineQuantity?: number;
  /** Récompense de fidélité choisie par le client connecté, et son solde de points. */
  reward?: RewardRule | null;
  pointsBalance?: number;
}

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string;
  options: { id: string; group: string; name: string; priceDeltaCents: number }[];
  categoryName: string;
  unitPriceCents: number;
  quantity: number;
  vatRate: number;
  totalCents: number;
  isAlcohol: boolean;
  isExtra: boolean;
  /** Part offerte de cette ligne (petits plus inclus), en centimes. */
  freeCents: number;
}

export type CartErrorCode =
  | "EMPTY"
  | "UNKNOWN_PRODUCT"
  | "UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "VARIANT_REQUIRED"
  | "INVALID_OPTIONS"
  | "INVALID_QUANTITY"
  | "NOT_FOR_MODE"
  | "NOT_FOR_PERIOD"
  | "NO_ALCOHOL_DELIVERY"
  | "NO_ZONE"
  | "MINIMUM_NOT_REACHED";

export interface CartError {
  code: CartErrorCode;
  /** Message en langue du restaurant (journaux, défaut) ; l'interface le traduit via code + params. */
  message: string;
  productId?: string;
  params?: Record<string, string | number>;
}

export interface PricedCart {
  ok: boolean;
  lines: PricedLine[];
  errors: CartError[];
  /** Somme des lignes, avant toute remise. */
  subtotalCents: number;
  /** « Petits plus » offerts (remise automatique). */
  extrasDiscountCents: number;
  freeExtras: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  vatBreakdown: VatLine[];
  minimumCents: number;
  missingCents: number;
  containsAlcohol: boolean;
  promoApplied: string | null;
  promoError: string | null;
  /** Remise de la récompense de fidélité (comprise dans le total). */
  loyaltyDiscountCents: number;
  rewardApplied: { id: string; name: string; pointsCost: number } | null;
  rewardError: RewardProblem | null;
}

export const MAX_LINE_QUANTITY = 50;

const MODE_LABEL: Record<Mode, string> = { PICKUP: "à emporter", DELIVERY: "en livraison", DINE_IN: "sur place" };

function availableFor(p: CatalogProduct, mode: Mode): boolean {
  return mode === "PICKUP" ? p.availablePickup : mode === "DELIVERY" ? p.availableDelivery : p.availableDineIn;
}

/** Vérifie un code promo ; renvoie un message d'erreur ou null si valable. */
export function promoProblem(promo: PromoRule, restaurantId: string, subtotalCents: number, now: Date): string | null {
  if (!promo.active) return "Ce code promo n'est plus actif.";
  if (promo.startsAt && now < promo.startsAt) return "Ce code promo n'est pas encore valable.";
  if (promo.endsAt && now > promo.endsAt) return "Ce code promo a expiré.";
  if (promo.restaurantIds.length && !promo.restaurantIds.includes(restaurantId)) return "Ce code promo n'est pas valable dans ce restaurant.";
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return "Ce code promo a atteint sa limite d'utilisation.";
  if (subtotalCents < promo.minSubtotalCents) {
    return `Ce code promo est valable dès ${(promo.minSubtotalCents / 100).toFixed(2).replace(".", ",")} € d'achat.`;
  }
  return null;
}

/** Le produit offert par une récompense peut-il être ajouté tel quel (sans choix obligatoire) ? */
function freeProductLine(p: CatalogProduct | undefined, ctx: PricingContext): CartLineInput | null {
  if (!p || !p.active || p.outOfStock || !availableFor(p, ctx.mode)) return null;
  if ((ctx.period === "LUNCH" && p.availableLunch === false) || (ctx.period === "DINNER" && p.availableDinner === false)) return null;
  if (p.isAlcohol && ctx.mode === "DELIVERY" && ctx.noAlcoholDelivery) return null;
  if (p.optionGroups.some((g) => g.minSelect > 0)) return null;
  const variants = p.variants.filter((v) => v.active && !v.outOfStock).sort((a, b) => a.priceCents - b.priceCents);
  if (p.variants.length && !variants.length) return null;
  return { productId: p.id, variantId: variants[0]?.id ?? null, optionIds: [], quantity: 1 };
}

export function priceCart(input: CartLineInput[], catalog: Map<string, CatalogProduct>, ctx: PricingContext): PricedCart {
  const errors: CartError[] = [];
  const lines: PricedLine[] = [];

  // Récompense « produit offert » : le produit est ajouté au panier s'il n'y est pas déjà.
  let rewardError: RewardProblem | null = null;
  if (ctx.reward?.type === "FREE_PRODUCT") {
    const pid = ctx.reward.productId ?? "";
    if (!input.some((l) => l.productId === pid)) {
      const extra = freeProductLine(catalog.get(pid), ctx);
      if (extra) input = [...input, extra];
      else rewardError = "PRODUCT_UNAVAILABLE";
    }
  }

  if (!input.length) errors.push({ code: "EMPTY", message: "Votre panier est vide." });

  // Quantité totale par produit (un même produit peut apparaître sur plusieurs lignes).
  const qtyByProduct = new Map<string, number>();
  let allowance = 0; // petits plus offerts restant à attribuer

  for (const item of input) {
    const p = catalog.get(item.productId);
    if (!p) {
      errors.push({ code: "UNKNOWN_PRODUCT", message: "Un produit de votre panier n'existe plus.", productId: item.productId });
      continue;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > (ctx.maxLineQuantity ?? MAX_LINE_QUANTITY)) {
      errors.push({ code: "INVALID_QUANTITY", message: `Quantité invalide pour « ${p.name} ».`, productId: p.id });
      continue;
    }
    if (!p.active) {
      errors.push({ code: "UNAVAILABLE", message: `« ${p.name} » n'est plus disponible.`, productId: p.id });
      continue;
    }
    if (p.outOfStock) {
      errors.push({ code: "OUT_OF_STOCK", message: `« ${p.name} » est en rupture de stock.`, productId: p.id });
      continue;
    }
    if (!availableFor(p, ctx.mode)) {
      errors.push({ code: "NOT_FOR_MODE", message: `« ${p.name} » n'est pas proposé ${MODE_LABEL[ctx.mode]}.`, productId: p.id });
      continue;
    }
    if ((ctx.period === "LUNCH" && p.availableLunch === false) || (ctx.period === "DINNER" && p.availableDinner === false)) {
      errors.push({ code: "NOT_FOR_PERIOD", message: `« ${p.name} » est proposé ${ctx.period === "LUNCH" ? "le soir" : "le midi"} uniquement.`, productId: p.id });
      continue;
    }
    if (p.isAlcohol && ctx.mode === "DELIVERY" && ctx.noAlcoholDelivery) {
      errors.push({ code: "NO_ALCOHOL_DELIVERY", message: `« ${p.name} » : pas d'alcool en livraison.`, productId: p.id });
      continue;
    }

    // Variante : obligatoire si le produit en a.
    let unit = p.priceCents;
    let variantLabel = "";
    let variantId: string | null = null;
    const activeVariants = p.variants.filter((v) => v.active);
    if (activeVariants.length) {
      const v = activeVariants.find((x) => x.id === item.variantId);
      if (!v) {
        errors.push({ code: "VARIANT_REQUIRED", message: `Choisissez une option pour « ${p.name} ».`, productId: p.id });
        continue;
      }
      if (v.outOfStock) {
        errors.push({ code: "OUT_OF_STOCK", message: `« ${p.name} – ${v.label} » est en rupture.`, productId: p.id });
        continue;
      }
      unit = v.priceCents;
      variantLabel = v.label;
      variantId = v.id;
    }

    // Options : chaque groupe respecte son minimum / maximum de choix.
    const chosen = new Set(item.optionIds ?? []);
    const options: PricedLine["options"] = [];
    let optionsOk = true;
    const known = new Set<string>();
    for (const g of p.optionGroups) {
      const picked = g.options.filter((o) => o.active && chosen.has(o.id));
      g.options.forEach((o) => known.add(o.id));
      if (picked.length < g.minSelect || picked.length > g.maxSelect) optionsOk = false;
      for (const o of picked) {
        options.push({ id: o.id, group: g.name, name: o.name, priceDeltaCents: o.priceDeltaCents });
        unit += o.priceDeltaCents;
      }
    }
    if ([...chosen].some((id) => !known.has(id))) optionsOk = false;
    if (!optionsOk) {
      errors.push({ code: "INVALID_OPTIONS", message: `Vérifiez les options de « ${p.name} ».`, productId: p.id });
      continue;
    }

    const total = (qtyByProduct.get(p.id) ?? 0) + item.quantity;
    qtyByProduct.set(p.id, total);
    if (p.maxQuantity !== null && total > p.maxQuantity) {
      errors.push({ code: "INVALID_QUANTITY", message: `« ${p.name} » : ${p.maxQuantity} maximum par commande.`, productId: p.id });
      continue;
    }

    lines.push({
      productId: p.id,
      variantId,
      name: p.name,
      variantLabel,
      options,
      categoryName: p.categoryName,
      unitPriceCents: unit,
      quantity: item.quantity,
      vatRate: p.vatRate,
      totalCents: unit * item.quantity,
      isAlcohol: p.isAlcohol,
      isExtra: !!p.isExtra,
      freeCents: 0,
    });
    allowance += p.isExtra ? 0 : (p.includedExtras ?? 0) * item.quantity;
  }

  // « Petits plus » offerts : chaque produit en inclut un nombre ; les plus chers sont offerts d'abord.
  let freeExtras = 0;
  for (const l of [...lines].filter((x) => x.isExtra && x.unitPriceCents > 0).sort((a, b) => b.unitPriceCents - a.unitPriceCents)) {
    const free = Math.min(allowance, l.quantity);
    l.freeCents = free * l.unitPriceCents;
    allowance -= free;
    freeExtras += free;
  }
  const extrasDiscount = lines.reduce((s, l) => s + l.freeCents, 0);
  const grossSubtotal = lines.reduce((s, l) => s + l.totalCents, 0);
  // Montant des produits réellement facturé : base du minimum, des frais et des codes promo.
  const subtotal = grossSubtotal - extrasDiscount;

  // Minimum de commande : zone (midi / soir) en livraison, minimum du restaurant sinon.
  let minimum = 0;
  let fee = 0;
  if (ctx.mode === "DELIVERY") {
    if (!ctx.zone) {
      errors.push({ code: "NO_ZONE", message: "Nous ne livrons pas encore à cette adresse." });
    } else {
      minimum = minimumFor(ctx.zone, ctx.period);
      fee = deliveryFee(ctx.zone, subtotal);
    }
  } else if (ctx.mode === "PICKUP") {
    minimum = ctx.pickupMinimumCents;
  }
  const missing = missingForMinimum(subtotal, minimum);
  if (missing > 0 && lines.length) {
    errors.push({
      code: "MINIMUM_NOT_REACHED",
      params: { min: money(minimum), missing: money(missing) },
      message: `Minimum de commande : ${(minimum / 100).toFixed(2).replace(".", ",")} €. Il vous manque ${(missing / 100).toFixed(2).replace(".", ",")} €.`,
    });
  }

  // Code promo
  let discount = 0;
  let promoApplied: string | null = null;
  let promoError: string | null = null;
  if (ctx.promo) {
    promoError = promoProblem(ctx.promo, ctx.restaurantId, subtotal, ctx.now);
    if (!promoError) {
      promoApplied = ctx.promo.code;
      if (ctx.promo.type === "AMOUNT") discount = Math.min(ctx.promo.value, subtotal);
      else if (ctx.promo.type === "PERCENT") discount = Math.round((subtotal * Math.min(100, ctx.promo.value)) / 100);
      else if (ctx.promo.type === "FREE_DELIVERY") {
        if (ctx.mode === "DELIVERY") fee = 0;
        else promoError = "Ce code offre la livraison : il ne s'applique pas au retrait.";
        if (promoError) promoApplied = null;
      }
    }
  }

  // Récompense de fidélité : après le code promo, plafonnée à ce qui reste à payer.
  let loyalty = 0;
  let rewardApplied: PricedCart["rewardApplied"] = null;
  if (ctx.reward && !rewardError) {
    rewardError = rewardProblem(ctx.reward, ctx.pointsBalance ?? 0, subtotal);
    if (!rewardError) {
      const freeLine = ctx.reward.type === "FREE_PRODUCT" ? lines.find((l) => l.productId === ctx.reward!.productId) : undefined;
      loyalty = rewardDiscount(ctx.reward, subtotal - discount, freeLine?.unitPriceCents ?? 0);
      rewardApplied = { id: ctx.reward.id, name: ctx.reward.name, pointsCost: ctx.reward.pointsCost };
    }
  }

  const total = subtotal - discount - loyalty + fee;

  // TVA : petits plus offerts déduits de leurs lignes ; remises (promo, fidélité) réparties au prorata ;
  // frais de livraison (accessoires) ventilés au prorata des taux des produits.
  const lineDiscounts = allocate(discount + loyalty, lines.map((l) => l.totalCents - l.freeCents));
  const netLines = lines.map((l, i) => ({ rate: l.vatRate, ttcCents: l.totalCents - l.freeCents - lineDiscounts[i]! }));
  const feeParts = allocate(fee, netLines.map((l) => l.ttcCents));
  const vat = vatBreakdown([...netLines, ...netLines.map((l, i) => ({ rate: l.rate, ttcCents: feeParts[i]! }))]);

  // Paramètres pour traduire les erreurs dans la langue du client.
  for (const e of errors) if (e.productId && !e.params) e.params = { name: catalog.get(e.productId)?.name ?? "" };

  return {
    ok: errors.length === 0,
    lines,
    errors,
    subtotalCents: grossSubtotal,
    extrasDiscountCents: extrasDiscount,
    freeExtras,
    discountCents: discount,
    deliveryFeeCents: fee,
    totalCents: total,
    vatBreakdown: vat,
    minimumCents: minimum,
    missingCents: missing,
    containsAlcohol: lines.some((l) => l.isAlcohol),
    promoApplied,
    promoError,
    loyaltyDiscountCents: loyalty,
    rewardApplied,
    rewardError,
  };
}
