import { describe, expect, it } from "vitest";
import { bucketOf, buildReport, toCsv, type SaleRow } from "../accounting";
import { zonedTime } from "../time";

const sale = (date: string, hhmm: string, over: Partial<SaleRow> = {}): SaleRow => ({
  slotStart: zonedTime(date, hhmm),
  mode: "PICKUP",
  paymentMethod: "CASH",
  paymentStatus: "PAID",
  totalCents: 2200,
  vatBreakdown: [{ rate: 1000, baseCents: 2000, vatCents: 200, totalCents: 2200 }],
  lines: [{ name: "Poké Saumon", quantity: 1, totalCents: 2200 }],
  ...over,
});

describe("comptabilité", () => {
  it("rattache une commande de 00h30 (heure de Paris) au bon jour", () => {
    const r = buildReport([sale("2026-10-17", "00:30")], [], "day");
    expect(r.buckets.map((b) => b.key)).toEqual(["2026-10-17"]);
  });

  it("totalise TTC / HT / TVA et ventile par taux", () => {
    const r = buildReport([
      sale("2026-10-17", "12:00"),
      sale("2026-10-17", "19:00", { mode: "DELIVERY", paymentMethod: "ONLINE_CARD", totalCents: 1600,
        vatBreakdown: [{ rate: 1000, baseCents: 1000, vatCents: 100, totalCents: 1100 }, { rate: 2000, baseCents: 417, vatCents: 83, totalCents: 500 }],
        lines: [{ name: "Poké Saumon", quantity: 1, totalCents: 1100 }, { name: "Bière Asahi", quantity: 1, totalCents: 500 }] }),
    ], [{ createdAt: new Date(), amountCents: 300 }], "day");
    expect(r.orders).toBe(2);
    expect(r.ttc).toBe(3800);
    expect(r.ht + r.vat).toBe(3800);
    expect(r.byVat).toEqual([{ rate: 1000, ht: 3000, vat: 300, ttc: 3300 }, { rate: 2000, ht: 417, vat: 83, ttc: 500 }]);
    expect(r.byMode.DELIVERY).toEqual({ orders: 1, ttc: 1600 });
    expect(r.byPayment.ONLINE_CARD!.paid).toBe(1600);
    expect(r.averageBasket).toBe(1900);
    expect(r.netTtc).toBe(3500);
    expect(r.topProducts[0]).toEqual({ name: "Poké Saumon", quantity: 2, ttc: 3300 });
  });

  it("regroupe par semaine (lundi) et par mois", () => {
    expect(bucketOf("2026-10-18", "week").key).toBe("2026-10-12"); // dimanche → lundi précédent
    expect(bucketOf("2026-10-19", "week").key).toBe("2026-10-19");
    expect(bucketOf("2026-10-18", "month")).toEqual({ key: "2026-10", label: "oct. 2026" });
  });

  it("produit un CSV lisible par Excel", () => {
    const csv = toCsv([["Nom", "Montant"], ["Poké; saumon", 12.5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Poké; saumon";12,5');
  });
});
