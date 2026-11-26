import { describe, expect, it } from "vitest";
import { offerAppliesToZone, offerValidAt, offerWhen, parseItems, type OfferRule } from "../offer-rules";

const base: OfferRule = {
  id: "o1", title: "Happy Box", badge: "Offre du mardi", description: "", items: [{ productId: "p1", variantId: null, priceCents: 2490 }], zoneIds: [],
  imageId: null, weekdays: [2], startsAt: null, endsAt: null, timeFrom: "", timeTo: "", restaurantIds: [], active: true, showOnHome: true, sortOrder: 0,
};

describe("offres du moment", () => {
  it("s'applique seulement le jour prévu (heure de Paris)", () => {
    expect(offerValidAt(base, new Date("2026-12-01T11:00:00Z"), "r1")).toBe(true); // mardi
    expect(offerValidAt(base, new Date("2026-12-02T11:00:00Z"), "r1")).toBe(false); // mercredi
    expect(offerValidAt(base, new Date("2026-11-30T23:30:00Z"), "r1")).toBe(true); // mardi 0 h 30 à Paris
  });
  it("respecte la période, les horaires, le restaurant et l'activation", () => {
    const noel = { ...base, weekdays: [], startsAt: new Date("2026-12-20T00:00:00+01:00"), endsAt: new Date("2026-12-31T23:59:00+01:00") };
    expect(offerValidAt(noel, new Date("2026-12-24T12:00:00Z"), "r1")).toBe(true);
    expect(offerValidAt(noel, new Date("2027-01-02T12:00:00Z"), "r1")).toBe(false);
    const midi = { ...base, weekdays: [], timeFrom: "11:00", timeTo: "14:00" };
    expect(offerValidAt(midi, new Date("2026-12-01T12:00:00Z"), "r1")).toBe(true); // 13 h
    expect(offerValidAt(midi, new Date("2026-12-01T18:00:00Z"), "r1")).toBe(false); // 19 h
    expect(offerValidAt({ ...base, restaurantIds: ["r2"] }, new Date("2026-12-01T11:00:00Z"), "r1")).toBe(false);
    expect(offerValidAt({ ...base, active: false }, new Date("2026-12-01T11:00:00Z"), "r1")).toBe(false);
  });
  it("décrit quand l'offre s'applique", () => {
    expect(offerWhen(base)).toBe("Tous les mardis");
    expect(offerWhen({ ...base, weekdays: [5, 6] })).toBe("Les vendredis et samedis");
    expect(offerWhen({ ...base, weekdays: [], startsAt: new Date("2026-12-20T00:00:00+01:00"), endsAt: new Date("2026-12-31T23:59:00+01:00") })).toBe("Du 20/12 au 31/12");
    expect(offerWhen({ ...base, weekdays: [], timeFrom: "11:00", timeTo: "14:00" })).toBe("De 11h00 à 14h00");
  });
  it("zones de livraison et lignes de produits", () => {
    expect(offerAppliesToZone(base, null)).toBe(true);
    expect(offerAppliesToZone({ zoneIds: ["z1"] }, null)).toBe(false);
    expect(offerAppliesToZone({ zoneIds: ["z1"] }, "z2")).toBe(false);
    expect(offerAppliesToZone({ zoneIds: ["z1"] }, "z1")).toBe(true);
    expect(parseItems([{ productId: "p1", priceCents: 2490 }, { productId: "p2", priceCents: -1 }, "x"])).toEqual([{ productId: "p1", variantId: null, priceCents: 2490 }]);
  });
});
