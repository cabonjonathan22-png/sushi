import { describe, expect, it } from "vitest";
import { badgeTextColor, parseConfig } from "../config-schema";

describe("configuration", () => {
  it("une configuration vide donne les valeurs d'origine", () => {
    const c = parseConfig({});
    expect(c.orders.autoAccept).toBe(false);
    expect(c.orders.notifyStatuses).toEqual(["ACCEPTED", "READY", "OUT_FOR_DELIVERY", "CANCELLED"]);
    expect(c.schedule.lunchDinnerCutoff).toBe("16:00");
    expect(c.catalog.badges.map((b) => b.code)).toContain("VEGETARIAN");
    expect(c.printing.deliveryCopies).toBe(2);
  });
  it("garde les valeurs enregistrées et complète le reste", () => {
    const c = parseConfig({ orders: { autoAccept: true } });
    expect(c.orders.autoAccept).toBe(true);
    expect(c.orders.maxLineQuantity).toBe(50);
  });
  it("revient aux défauts si l'enregistrement est invalide", () => {
    expect(parseConfig({ orders: { maxLineQuantity: -3 } }).orders.maxLineQuantity).toBe(50);
  });
  it("choisit un texte lisible sur la couleur du badge", () => {
    expect(badgeTextColor("#ffffff")).toBe("#0b0b0b");
    expect(badgeTextColor("#0b0b0b")).toBe("#ffffff");
  });
});
