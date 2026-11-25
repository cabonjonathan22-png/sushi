import { describe, expect, it } from "vitest";
import type { FullOrder } from "../orders/load";
import { GENESIS, settle, ticketHash } from "../pos-rules";
import { buildReceipt, jobTickets, renderText } from "../print/ticket";

describe("caisse : règlements et monnaie rendue", () => {
  it("paiement exact en espèces", () => {
    expect(settle(1250, [{ method: "CASH", amountCents: 1250 }])).toEqual({ ok: true, records: [{ method: "CASH", amountCents: 1250 }], changeCents: 0 });
  });
  it("rend la monnaie sur un billet de 20 €", () => {
    const r = settle(1250, [{ method: "CASH", amountCents: 2000 }]);
    expect(r).toEqual({ ok: true, records: [{ method: "CASH", amountCents: 1250 }], changeCents: 750 });
  });
  it("paiement partagé titre-restaurant + espèces", () => {
    const r = settle(3000, [{ method: "MEAL_VOUCHER_CARD", amountCents: 1900 }, { method: "CASH", amountCents: 2000 }]);
    expect(r).toEqual({ ok: true, records: [{ method: "MEAL_VOUCHER_CARD", amountCents: 1900 }, { method: "CASH", amountCents: 1100 }], changeCents: 900 });
  });
  it("refuse une carte qui dépasse le montant dû et un règlement incomplet", () => {
    expect(settle(1000, [{ method: "CARD_TERMINAL", amountCents: 1200 }]).ok).toBe(false);
    const r = settle(1000, [{ method: "CASH", amountCents: 500 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("5,00");
  });
  it("regroupe deux règlements du même moyen", () => {
    const r = settle(1000, [{ method: "CARD_TERMINAL", amountCents: 400 }, { method: "CARD_TERMINAL", amountCents: 600 }]);
    expect(r).toEqual({ ok: true, records: [{ method: "CARD_TERMINAL", amountCents: 1000 }], changeCents: 0 });
  });
});

describe("caisse : chaînage des tickets (inaltérabilité)", () => {
  const t = {
    reference: "YS-CUC-000042", number: 42, placedAt: new Date("2026-11-25T12:00:00Z"), totalCents: 2450,
    vatBreakdown: [{ rate: 1000, baseCents: 2227, vatCents: 223, totalCents: 2450 }],
    lines: [{ name: "California saumon", quantity: 2, totalCents: 2450, vatRate: 1000 }],
    payments: [{ method: "CASH", amountCents: 2450 }],
  };
  it("est stable et dépend du ticket précédent", () => {
    const a = ticketHash(GENESIS, t);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(ticketHash(GENESIS, t)).toBe(a);
    expect(ticketHash(a, t)).not.toBe(a);
  });
  it("change dès qu'un montant, une ligne ou un règlement est modifié", () => {
    const a = ticketHash(GENESIS, t);
    expect(ticketHash(GENESIS, { ...t, totalCents: 2440 })).not.toBe(a);
    expect(ticketHash(GENESIS, { ...t, lines: [{ ...t.lines[0]!, quantity: 1 }] })).not.toBe(a);
    expect(ticketHash(GENESIS, { ...t, payments: [{ method: "CARD_TERMINAL", amountCents: 2450 }] })).not.toBe(a);
  });
});

describe("caisse : ticket client", () => {
  const order = {
    id: "o1", number: 42, dailyNumber: 7, reference: "YS-CUC-000042", mode: "DINE_IN", tableLabel: "5", placedAt: new Date("2026-11-25T12:00:00Z"),
    slotStart: new Date("2026-11-25T12:00:00Z"), customerName: "Table 5", customerPhone: "", notes: "", promoCode: "REMISE",
    extrasDiscountCents: 0, discountCents: 245, loyaltyDiscountCents: 0, loyaltyRewardName: "", deliveryFeeCents: 0, totalCents: 2205,
    vatBreakdown: [{ rate: 1000, baseCents: 2005, vatCents: 200, totalCents: 2205 }], changeCents: 795, chainHash: "ab".repeat(32),
    paymentMethod: "CASH", paymentStatus: "PAID", extrasDeclined: false,
    lines: [{ name: "California saumon", variantLabel: "", options: [], quantity: 2, totalCents: 2450, isAlcohol: false }],
    payments: [{ method: "CASH", amountCents: 2205, status: "SUCCEEDED" }],
    restaurant: { name: "Yaoma Cucuron", street: "1 place de l'Étang", postalCode: "84160", city: "Cucuron", phones: ["04 00 00 00 00"] },
  } as unknown as FullOrder;
  const legal = { brandName: "Yaoma Sushi", companyName: "Yaoma SAS", siret: "12345678900011", vatNumber: "FR00123456789" };

  it("porte les mentions, la TVA, les règlements, la monnaie et l'empreinte", () => {
    const text = renderText(buildReceipt(order, legal), 48);
    for (const s of ["YAOMA SUSHI", "SIRET 12345678900011", "TVA FR00123456789", "Ticket n° 42", "Table 5", "Remise", "TOTAL TTC", "TVA 10 %", "Espèces", "30,00", "Rendu monnaie", "7,95", "Empreinte abababab"]) {
      expect(text).toContain(s);
    }
    expect(text).not.toContain("DUPLICATA");
  });
  it("marque la réimpression « DUPLICATA » et n'imprime rien pour le tiroir seul", () => {
    expect(renderText(jobTickets(order, "RECEIPT_DUP", 1, legal)[0]!, 48)).toContain("DUPLICATA");
    expect(jobTickets(order, "DRAWER", 1, legal)).toEqual([]);
    expect(jobTickets(order, "ORDER", 3, legal)).toHaveLength(3);
  });
});
