import { describe, expect, it, vi } from "vitest";
import { extrasFromRule, nextExtrasTier, priceCart, type CatalogProduct, type PricingContext } from "../cart";
import { parseAddress } from "../print/jobs";

vi.mock("server-only", () => ({}));
const { isValidCardNumber, luhnDigit, parseCardInput } = await import("../loyalty-card");

const base: Omit<CatalogProduct, "id" | "name" | "priceCents"> = {
  vatRate: 1000, active: true, outOfStock: false, isAlcohol: false, maxQuantity: null,
  availablePickup: true, availableDelivery: true, availableDineIn: true, categoryName: "", variants: [], optionGroups: [],
};
const catalog = new Map<string, CatalogProduct>([
  { ...base, id: "plat", name: "Plateau", priceCents: 2000 },
  { ...base, id: "soja", name: "Sauce soja", priceCents: 50, isExtra: true },
  { ...base, id: "wasabi", name: "Wasabi", priceCents: 80, isExtra: true },
  { ...base, id: "baguettes", name: "Baguettes", priceCents: 0, isExtra: true },
].map((p) => [p.id, p]));
const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  restaurantId: "r1", mode: "PICKUP", period: "LUNCH", zone: null, pickupMinimumCents: 0,
  noAlcoholDelivery: false, promo: null, now: new Date("2026-10-20T10:00:00Z"), ...over,
});
const rule = { freePerOrder: 1, tiers: [{ fromCents: 4000, count: 3 }, { fromCents: 2500, count: 1 }] };

describe("compléments offerts", () => {
  it("additionne l'offre de base et le palier le plus élevé atteint", () => {
    expect(extrasFromRule(rule, 1000)).toBe(1);
    expect(extrasFromRule(rule, 2500)).toBe(2);
    expect(extrasFromRule(rule, 4000)).toBe(4);
    expect(extrasFromRule(null, 9000)).toBe(0);
  });

  it("indique le prochain palier", () => {
    expect(nextExtrasTier(rule, 2000)).toEqual({ fromCents: 2500, count: 1, missingCents: 500 });
    expect(nextExtrasTier(rule, 3000)).toEqual({ fromCents: 4000, count: 3, missingCents: 1000 });
    expect(nextExtrasTier(rule, 5000)).toBeNull();
  });

  it("offre les compléments les plus chers d'abord, selon le montant des plats seulement", () => {
    const r = priceCart([{ productId: "plat", quantity: 1 }, { productId: "soja", quantity: 2 }, { productId: "wasabi", quantity: 1 }], catalog, ctx({ extrasRule: rule }));
    // 20 € de plats : 1 offert (base) → le wasabi (0,80 €)
    expect(r.extrasAllowance).toBe(1);
    expect(r.freeExtras).toBe(1);
    expect(r.extrasDiscountCents).toBe(80);
    expect(r.extrasCount).toBe(3);
    expect(r.totalCents).toBe(2000 + 100);
    expect(r.nextExtrasTier?.missingCents).toBe(500);
  });

  it("palier atteint : plusieurs compléments offerts", () => {
    const r = priceCart([{ productId: "plat", quantity: 2 }, { productId: "soja", quantity: 3 }], catalog, ctx({ extrasRule: rule }));
    expect(r.extrasAllowance).toBe(4);
    expect(r.extrasDiscountCents).toBe(150);
    expect(r.totalCents).toBe(4000);
  });
});

describe("carte de fidélité", () => {
  it("n° à 12 chiffres avec chiffre de contrôle", () => {
    const body = "29123456789";
    const n = body + luhnDigit(body);
    expect(isValidCardNumber(n)).toBe(true);
    expect(isValidCardNumber(body + ((luhnDigit(body) + 1) % 10))).toBe(false);
    expect(parseCardInput(`https://www.yaoma-sushi.com/f/${n}`)).toBe(n);
    expect(parseCardInput(n.replace(/(\d{4})/g, "$1 "))).toBe(n);
    expect(parseCardInput("0612345678")).toBeNull();
  });
});

describe("adresse d'imprimante", () => {
  it("port 9100 par défaut", () => {
    expect(parseAddress("192.168.1.87")).toEqual({ host: "192.168.1.87", port: 9100 });
    expect(parseAddress("box.example.fr:9187")).toEqual({ host: "box.example.fr", port: 9187 });
    expect(parseAddress("http://x")).toBeNull();
    expect(parseAddress("1.2.3.4:70000")).toBeNull();
  });
});
