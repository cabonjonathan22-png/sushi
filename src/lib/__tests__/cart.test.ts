import { describe, expect, it } from "vitest";
import { priceCart, promoProblem, type CatalogProduct, type PricingContext, type PromoRule } from "../cart";
import type { ZoneRule } from "../zones";

const base: Omit<CatalogProduct, "id" | "name" | "priceCents"> = {
  vatRate: 1000,
  active: true,
  outOfStock: false,
  isAlcohol: false,
  maxQuantity: null,
  availablePickup: true,
  availableDelivery: true,
  availableDineIn: true,
  categoryName: "Plats",
  variants: [],
  optionGroups: [],
};

const catalog = new Map<string, CatalogProduct>(
  [
    { ...base, id: "poke", name: "Poké Saumon", priceCents: 1660 },
    { ...base, id: "biere", name: "Bière Asahi", priceCents: 400, vatRate: 2000, isAlcohol: true },
    {
      ...base,
      id: "gyoza",
      name: "Gyozas",
      priceCents: 490,
      variants: [
        { id: "g3", label: "3 · Frit", priceCents: 490, active: true, outOfStock: false },
        { id: "g6", label: "6 · Frit", priceCents: 850, active: true, outOfStock: false },
        { id: "gx", label: "6 · Vapeur", priceCents: 850, active: true, outOfStock: true },
      ],
    },
    {
      ...base,
      id: "ramen",
      name: "Ramen",
      priceCents: 1690,
      optionGroups: [
        { id: "sup", name: "Supplément", minSelect: 0, maxSelect: 2, options: [
          { id: "oeuf", name: "Œuf", priceDeltaCents: 150, active: true },
          { id: "nori", name: "Nori", priceDeltaCents: 0, active: true },
        ] },
      ],
    },
    { ...base, id: "takoyaki", name: "Takoyaki", priceCents: 990, outOfStock: true },
    { ...base, id: "baguettes", name: "Baguettes", priceCents: 0, maxQuantity: 4 },
    { ...base, id: "surplace", name: "Plat sur place", priceCents: 1000, availableDelivery: false },
  ].map((p) => [p.id, p]),
);

const zone1: ZoneRule = {
  id: "z1", name: "Zone 1", active: true, minLunchCents: 2000, minDinnerCents: 3500,
  feeCents: 300, freeFromCents: 5000, etaMinutes: 30, areas: [{ postalCode: "84160", city: "Cucuron" }],
};

const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  restaurantId: "r1", mode: "PICKUP", period: "LUNCH", zone: null, pickupMinimumCents: 0,
  noAlcoholDelivery: false, promo: null, now: new Date("2026-10-17T10:00:00Z"), ...over,
});

describe("priceCart — prix recalculés côté serveur", () => {
  it("calcule sous-total, total et TVA par taux", () => {
    const r = priceCart([{ productId: "poke", quantity: 2 }, { productId: "biere", quantity: 1 }], catalog, ctx());
    expect(r.ok).toBe(true);
    expect(r.subtotalCents).toBe(3720);
    expect(r.totalCents).toBe(3720);
    expect(r.vatBreakdown).toEqual([
      { rate: 1000, baseCents: 3018, vatCents: 302, totalCents: 3320 },
      { rate: 2000, baseCents: 333, vatCents: 67, totalCents: 400 },
    ]);
    expect(r.containsAlcohol).toBe(true);
  });

  it("ignore tout prix venant du client (seuls les identifiants comptent)", () => {
    const r = priceCart([{ productId: "poke", quantity: 1, priceCents: 1 } as never], catalog, ctx());
    expect(r.totalCents).toBe(1660);
  });

  it("exige une variante et prend son prix", () => {
    expect(priceCart([{ productId: "gyoza", quantity: 1 }], catalog, ctx()).errors[0]!.code).toBe("VARIANT_REQUIRED");
    const r = priceCart([{ productId: "gyoza", variantId: "g6", quantity: 2 }], catalog, ctx());
    expect(r.lines[0]).toMatchObject({ unitPriceCents: 850, variantLabel: "6 · Frit", totalCents: 1700 });
  });

  it("refuse une variante en rupture ou inconnue", () => {
    expect(priceCart([{ productId: "gyoza", variantId: "gx", quantity: 1 }], catalog, ctx()).errors[0]!.code).toBe("OUT_OF_STOCK");
    expect(priceCart([{ productId: "gyoza", variantId: "pirate", quantity: 1 }], catalog, ctx()).errors[0]!.code).toBe("VARIANT_REQUIRED");
  });

  it("ajoute les options payantes et respecte le maximum de choix", () => {
    const r = priceCart([{ productId: "ramen", optionIds: ["oeuf", "nori"], quantity: 1 }], catalog, ctx());
    expect(r.lines[0]!.unitPriceCents).toBe(1840);
    expect(r.lines[0]!.options).toHaveLength(2);
    const bad = priceCart([{ productId: "ramen", optionIds: ["inconnue"], quantity: 1 }], catalog, ctx());
    expect(bad.errors[0]!.code).toBe("INVALID_OPTIONS");
  });

  it("refuse ruptures, quantités invalides et maximum par commande", () => {
    expect(priceCart([{ productId: "takoyaki", quantity: 1 }], catalog, ctx()).errors[0]!.code).toBe("OUT_OF_STOCK");
    expect(priceCart([{ productId: "poke", quantity: 0 }], catalog, ctx()).errors[0]!.code).toBe("INVALID_QUANTITY");
    expect(priceCart([{ productId: "poke", quantity: 1.5 }], catalog, ctx()).errors[0]!.code).toBe("INVALID_QUANTITY");
    const r = priceCart([{ productId: "baguettes", quantity: 3 }, { productId: "baguettes", quantity: 2 }], catalog, ctx());
    expect(r.errors.map((e) => e.code)).toEqual(["INVALID_QUANTITY"]);
  });

  it("refuse un produit non proposé dans ce mode, et l'alcool en livraison si interdit", () => {
    const d = ctx({ mode: "DELIVERY", zone: zone1 });
    expect(priceCart([{ productId: "surplace", quantity: 3 }], catalog, d).errors[0]!.code).toBe("NOT_FOR_MODE");
    const r = priceCart([{ productId: "poke", quantity: 3 }, { productId: "biere", quantity: 1 }], catalog, { ...d, noAlcoholDelivery: true });
    expect(r.errors.map((e) => e.code)).toEqual(["NO_ALCOHOL_DELIVERY"]);
  });

  it("refuse un panier vide", () => {
    expect(priceCart([], catalog, ctx()).errors[0]!.code).toBe("EMPTY");
  });
});

describe("minimum de commande par zone et par service", () => {
  it("applique le minimum du midi et calcule le montant manquant", () => {
    const r = priceCart([{ productId: "poke", quantity: 1 }], catalog, ctx({ mode: "DELIVERY", zone: zone1, period: "LUNCH" }));
    expect(r.minimumCents).toBe(2000);
    expect(r.missingCents).toBe(340);
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.message).toContain("Il vous manque 3,40 €");
  });

  it("applique le minimum du soir (plus élevé)", () => {
    const r = priceCart([{ productId: "poke", quantity: 2 }], catalog, ctx({ mode: "DELIVERY", zone: zone1, period: "DINNER" }));
    expect(r.minimumCents).toBe(3500);
    expect(r.missingCents).toBe(180); // 33,20 € pour 35 € minimum le soir
    const ok = priceCart([{ productId: "poke", quantity: 3 }], catalog, ctx({ mode: "DELIVERY", zone: zone1, period: "DINNER" }));
    expect(ok.ok).toBe(true);
  });

  it("refuse la livraison hors zone", () => {
    const r = priceCart([{ productId: "poke", quantity: 5 }], catalog, ctx({ mode: "DELIVERY", zone: null }));
    expect(r.errors.map((e) => e.code)).toEqual(["NO_ZONE"]);
  });

  it("facture les frais sous le seuil, offre la livraison au-delà", () => {
    const sous = priceCart([{ productId: "poke", quantity: 2 }], catalog, ctx({ mode: "DELIVERY", zone: zone1 }));
    expect(sous.deliveryFeeCents).toBe(300);
    expect(sous.totalCents).toBe(3620);
    const dessus = priceCart([{ productId: "poke", quantity: 4 }], catalog, ctx({ mode: "DELIVERY", zone: zone1 }));
    expect(dessus.deliveryFeeCents).toBe(0);
  });

  it("applique le minimum de retrait du restaurant", () => {
    const r = priceCart([{ productId: "biere", quantity: 1 }], catalog, ctx({ pickupMinimumCents: 1000 }));
    expect(r.missingCents).toBe(600);
  });

  it("ventile les frais de livraison au prorata des taux de TVA", () => {
    const r = priceCart([{ productId: "poke", quantity: 2 }, { productId: "biere", quantity: 1 }], catalog, ctx({ mode: "DELIVERY", zone: { ...zone1, freeFromCents: null } }));
    const total = r.vatBreakdown.reduce((s, v) => s + v.totalCents, 0);
    expect(total).toBe(r.totalCents);
    expect(r.vatBreakdown.find((v) => v.rate === 2000)!.totalCents).toBeGreaterThan(400);
  });
});

describe("plats du midi / du soir", () => {
  it("refuse un plat du midi pour un créneau du soir", () => {
    const cat = new Map(catalog);
    cat.set("formule", { ...base, id: "formule", name: "Formule midi", priceCents: 1500, availableDinner: false });
    expect(priceCart([{ productId: "formule", quantity: 1 }], cat, ctx({ period: "LUNCH" })).ok).toBe(true);
    const soir = priceCart([{ productId: "formule", quantity: 1 }], cat, ctx({ period: "DINNER" }));
    expect(soir.errors[0]).toMatchObject({ code: "NOT_FOR_PERIOD", message: "« Formule midi » est proposé le midi uniquement." });
  });
  it("applique la quantité maximum réglée", () => {
    expect(priceCart([{ productId: "poke", quantity: 6 }], catalog, ctx({ maxLineQuantity: 5 })).errors[0]!.code).toBe("INVALID_QUANTITY");
  });
});

describe("petits plus offerts", () => {
  const cat = new Map(catalog);
  cat.set("plateau", { ...base, id: "plateau", name: "Plateau", priceCents: 2000, includedExtras: 2 });
  cat.set("soja", { ...base, id: "soja", name: "Sauce soja", priceCents: 100, isExtra: true });
  cat.set("wasabi", { ...base, id: "wasabi", name: "Wasabi", priceCents: 150, isExtra: true });

  it("offre les petits plus inclus, les plus chers d'abord, et garde la TVA cohérente", () => {
    const r = priceCart([{ productId: "plateau", quantity: 1 }, { productId: "soja", quantity: 2 }, { productId: "wasabi", quantity: 1 }], cat, ctx());
    expect(r.subtotalCents).toBe(2350);
    expect(r.freeExtras).toBe(2);
    expect(r.extrasDiscountCents).toBe(250); // wasabi 1,50 + une sauce 1,00
    expect(r.totalCents).toBe(2100);
    expect(r.vatBreakdown.reduce((s, v) => s + v.totalCents, 0)).toBe(2100);
  });

  it("ne compte pas la remise pour atteindre le minimum", () => {
    const r = priceCart([{ productId: "plateau", quantity: 1 }, { productId: "soja", quantity: 5 }], cat, ctx({ pickupMinimumCents: 2400 }));
    expect(r.extrasDiscountCents).toBe(200);
    expect(r.missingCents).toBe(100); // 25,00 − 2,00 offerts = 23,00 facturés
  });
});

describe("codes promo", () => {
  const promo = (over: Partial<PromoRule> = {}): PromoRule => ({
    code: "BIENVENUE", type: "PERCENT", value: 10, minSubtotalCents: 0, startsAt: null, endsAt: null,
    maxUses: null, usedCount: 0, active: true, restaurantIds: [], ...over,
  });

  it("applique un pourcentage et garde la TVA cohérente", () => {
    const r = priceCart([{ productId: "poke", quantity: 2 }, { productId: "biere", quantity: 1 }], catalog, ctx({ promo: promo() }));
    expect(r.discountCents).toBe(372);
    expect(r.totalCents).toBe(3348);
    expect(r.vatBreakdown.reduce((s, v) => s + v.totalCents, 0)).toBe(3348);
  });

  it("plafonne un montant fixe au sous-total", () => {
    const r = priceCart([{ productId: "biere", quantity: 1 }], catalog, ctx({ promo: promo({ type: "AMOUNT", value: 1000 }) }));
    expect(r.discountCents).toBe(400);
    expect(r.totalCents).toBe(0);
  });

  it("offre la livraison", () => {
    const r = priceCart([{ productId: "poke", quantity: 2 }], catalog, ctx({ mode: "DELIVERY", zone: zone1, promo: promo({ type: "FREE_DELIVERY" }) }));
    expect(r.deliveryFeeCents).toBe(0);
    expect(r.promoApplied).toBe("BIENVENUE");
  });

  it("refuse un code expiré, épuisé, hors restaurant ou sous le minimum", () => {
    const now = new Date("2026-10-17T10:00:00Z");
    expect(promoProblem(promo({ endsAt: new Date("2026-10-01") }), "r1", 5000, now)).toMatch(/expiré/);
    expect(promoProblem(promo({ maxUses: 3, usedCount: 3 }), "r1", 5000, now)).toMatch(/limite/);
    expect(promoProblem(promo({ restaurantIds: ["r2"] }), "r1", 5000, now)).toMatch(/restaurant/);
    expect(promoProblem(promo({ minSubtotalCents: 3000 }), "r1", 2000, now)).toMatch(/30,00 €/);
    const r = priceCart([{ productId: "poke", quantity: 1 }], catalog, ctx({ promo: promo({ active: false }) }));
    expect(r.discountCents).toBe(0);
    expect(r.promoError).toBeTruthy();
  });
});
