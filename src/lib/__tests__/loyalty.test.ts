import { describe, expect, it } from "vitest";
import { priceCart, type CatalogProduct, type PricingContext } from "../cart";
import { nextReward, pointsFor, rewardDiscount, type RewardRule } from "../loyalty-rules";

const base: Omit<CatalogProduct, "id" | "name" | "priceCents"> = {
  vatRate: 1000, active: true, outOfStock: false, isAlcohol: false, maxQuantity: null,
  availablePickup: true, availableDelivery: true, availableDineIn: true, categoryName: "Plats", variants: [], optionGroups: [],
};
const catalog = new Map<string, CatalogProduct>([
  { ...base, id: "poke", name: "Poké Saumon", priceCents: 1660 },
  { ...base, id: "mochi", name: "Mochis", priceCents: 600, categoryName: "Desserts" },
  { ...base, id: "ramen", name: "Ramen", priceCents: 1690, optionGroups: [{ id: "base", name: "Base", minSelect: 1, maxSelect: 1, options: [{ id: "b", name: "Bœuf", priceDeltaCents: 0, active: true }] }] },
].map((p) => [p.id, p]));

const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  restaurantId: "r1", mode: "PICKUP", period: "LUNCH", zone: null, pickupMinimumCents: 0, noAlcoholDelivery: false, promo: null, now: new Date("2026-10-20T10:00:00Z"), ...over,
});
const reward = (over: Partial<RewardRule>): RewardRule => ({ id: "r", name: "Récompense", type: "AMOUNT", value: 500, productId: null, pointsCost: 100, minSubtotalCents: 0, active: true, ...over });
const cart = [{ productId: "poke", quantity: 2 }];

describe("carte de fidélité", () => {
  it("1 point par euro payé, arrondi à l'inférieur", () => {
    expect(pointsFor(3399, 1)).toBe(33);
    expect(pointsFor(3399, 2)).toBe(67);
    expect(pointsFor(-5, 1)).toBe(0);
  });

  it("remise en euros déduite du total, TVA recalculée", () => {
    const r = priceCart(cart, catalog, ctx({ reward: reward({}), pointsBalance: 150 }));
    expect(r.loyaltyDiscountCents).toBe(500);
    expect(r.totalCents).toBe(3320 - 500);
    expect(r.vatBreakdown.reduce((a, v) => a + v.totalCents, 0)).toBe(r.totalCents);
    expect(r.rewardApplied?.pointsCost).toBe(100);
  });

  it("remise en pourcentage, après un code promo", () => {
    const promo = { code: "X", type: "AMOUNT" as const, value: 320, minSubtotalCents: 0, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, active: true, restaurantIds: [] };
    const r = priceCart(cart, catalog, ctx({ promo, reward: reward({ type: "PERCENT", value: 10 }), pointsBalance: 100 }));
    expect(r.discountCents).toBe(320);
    expect(r.loyaltyDiscountCents).toBe(300);
    expect(r.totalCents).toBe(3320 - 320 - 300);
  });

  it("produit offert : ajouté au panier puis déduit", () => {
    const r = priceCart(cart, catalog, ctx({ reward: reward({ type: "FREE_PRODUCT", productId: "mochi" }), pointsBalance: 100 }));
    expect(r.lines.map((l) => l.productId)).toEqual(["poke", "mochi"]);
    expect(r.loyaltyDiscountCents).toBe(600);
    expect(r.totalCents).toBe(3320);
  });

  it("produit offert déjà dans le panier : un seul exemplaire offert", () => {
    const r = priceCart([...cart, { productId: "mochi", quantity: 2 }], catalog, ctx({ reward: reward({ type: "FREE_PRODUCT", productId: "mochi" }), pointsBalance: 100 }));
    expect(r.loyaltyDiscountCents).toBe(600);
    expect(r.totalCents).toBe(3320 + 1200 - 600);
  });

  it("refuse une récompense sans assez de points, sous le minimum, ou avec un produit à choix obligatoire", () => {
    expect(priceCart(cart, catalog, ctx({ reward: reward({}), pointsBalance: 99 })).rewardError).toBe("NOT_ENOUGH_POINTS");
    expect(priceCart(cart, catalog, ctx({ reward: reward({ minSubtotalCents: 5000 }), pointsBalance: 100 })).rewardError).toBe("MINIMUM");
    const r = priceCart(cart, catalog, ctx({ reward: reward({ type: "FREE_PRODUCT", productId: "ramen" }), pointsBalance: 100 }));
    expect(r.rewardError).toBe("PRODUCT_UNAVAILABLE");
    expect(r.loyaltyDiscountCents).toBe(0);
    expect(r.lines).toHaveLength(1);
  });

  it("une remise ne dépasse jamais le montant restant", () => {
    expect(rewardDiscount(reward({ value: 5000 }), 1200)).toBe(1200);
  });

  it("prochaine récompense à atteindre", () => {
    const list = [{ pointsCost: 300, active: true }, { pointsCost: 100, active: true }, { pointsCost: 150, active: false }];
    expect(nextReward(list, 120)?.pointsCost).toBe(300);
    expect(nextReward(list, 50)?.pointsCost).toBe(100);
  });
});
