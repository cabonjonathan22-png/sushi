import { describe, expect, it } from "vitest";
import { allocate, euros, parseEuros, vatFromTtc } from "../money";
import { allowedTransitions, canTransition, primaryNext } from "../order-status";
import { can, canManageRole, restaurantScope, type Actor } from "../permissions";
import { computeSlots, findAvailableSlot, isOpenAt, type OpeningRange, type SlotSettings } from "../slots";
import { localDate, zonedTime } from "../time";
import { citiesForPostalCode, cityKey, deliveryFee, findZone, type ZoneRule } from "../zones";

describe("argent", () => {
  it("formate et lit les euros", () => {
    expect(euros(1290)).toBe("12,90 €");
    expect(parseEuros("12,9")).toBe(1290);
    expect(parseEuros("abc")).toBeNull();
  });
  it("extrait la TVA d'un TTC", () => {
    expect(vatFromTtc(1100, 1000)).toBe(100);
    expect(vatFromTtc(1200, 2000)).toBe(200);
  });
  it("répartit sans perdre de centime", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });
});

describe("zones : code postal + commune", () => {
  const zones: ZoneRule[] = [
    { id: "z1", name: "Zone 1", active: true, minLunchCents: 2000, minDinnerCents: 3500, feeCents: 0, freeFromCents: null, etaMinutes: 30,
      areas: [{ postalCode: "84160", city: "Cucuron" }, { postalCode: "84160", city: "Vaugines" }, { postalCode: "84240", city: "Cabrières-d'Aigues" }] },
    { id: "z2", name: "Zone 2", active: true, minLunchCents: 2000, minDinnerCents: 4000, feeCents: 0, freeFromCents: null, etaMinutes: 40,
      areas: [{ postalCode: "84160", city: "Cadenet" }, { postalCode: "84160", city: "Lourmarin" }] },
    { id: "z3", name: "Inactive", active: false, minLunchCents: 0, minDinnerCents: 0, feeCents: 0, freeFromCents: null, etaMinutes: 0,
      areas: [{ postalCode: "84360", city: "Lauris" }] },
  ];

  it("distingue deux communes du même code postal", () => {
    expect(findZone(zones, "84160", "Cucuron")?.id).toBe("z1");
    expect(findZone(zones, "84160", "CADENET")?.id).toBe("z2");
    expect(findZone(zones, "84160", "Pertuis")).toBeNull();
  });
  it("tolère accents, tirets et espaces", () => {
    expect(findZone(zones, "84 240", "cabrieres d aigues")?.id).toBe("z1");
    expect(cityKey("St-Martin")).toBe(cityKey("Saint Martin"));
  });
  it("ignore les zones inactives", () => {
    expect(findZone(zones, "84360", "Lauris")).toBeNull();
  });
  it("liste les communes desservies d'un code postal", () => {
    expect(citiesForPostalCode(zones, "84160")).toEqual(["Cadenet", "Cucuron", "Lourmarin", "Vaugines"]);
  });
  it("offre la livraison au-delà du seuil", () => {
    expect(deliveryFee({ feeCents: 300, freeFromCents: 5000 }, 4999)).toBe(300);
    expect(deliveryFee({ feeCents: 300, freeFromCents: 5000 }, 5000)).toBe(0);
  });
});

describe("créneaux et horaires", () => {
  // Mardi → dimanche, 10:00-14:00 et 17:30-21:30.
  const hours: OpeningRange[] = [2, 3, 4, 5, 6, 0].flatMap((weekday) => [
    { weekday, opens: "10:00", closes: "14:00", period: "LUNCH" as const },
    { weekday, opens: "17:30", closes: "21:30", period: "DINNER" as const },
  ]);
  const settings: SlotSettings = {
    prepMinutes: 20, slotMinutes: 15, maxOrdersPerSlot: null, maxDaysAhead: 2, ordersPausedUntil: null, timezone: "Europe/Paris",
  };

  it("propose des créneaux à partir de maintenant + préparation, alignés sur 15 min", () => {
    // Samedi 17/10/2026 11:02 à Paris (UTC+2).
    const now = zonedTime("2026-10-17", "11:02");
    const days = computeSlots({ now, settings, hours, closures: [] });
    expect(days[0]!.date).toBe("2026-10-17");
    expect(days[0]!.slots[0]!.label).toBe("11:30");
    expect(days[0]!.slots.at(-1)!.label).toBe("21:15");
    const soir = days[0]!.slots.find((s) => s.period === "DINNER")!;
    expect(soir.label).toBe("18:00"); // 17:30 + 20 min = 17:50, aligné sur la grille de 15 min
  });

  it("ajoute le délai de livraison de la zone", () => {
    const now = zonedTime("2026-10-17", "11:02");
    const days = computeSlots({ now, settings, hours, closures: [], extraMinutes: 30 });
    expect(days[0]!.slots[0]!.label).toBe("12:00");
  });

  it("saute le lundi (fermé) et les fermetures exceptionnelles", () => {
    const now = zonedTime("2026-10-18", "22:00"); // dimanche soir
    const days = computeSlots({ now, settings: { ...settings, maxDaysAhead: 3 }, hours, closures: [{ startDate: "2026-10-20", endDate: "2026-10-20" }] });
    expect(days.map((d) => d.date)).toEqual(["2026-10-21"]); // lundi fermé, mardi en congé
  });

  it("ne propose rien quand les commandes sont en pause", () => {
    const now = zonedTime("2026-10-17", "11:00");
    const paused = { ...settings, ordersPausedUntil: zonedTime("2026-10-17", "23:59") };
    expect(computeSlots({ now, settings: paused, hours, closures: [] })).toEqual([]);
  });

  it("marque un créneau complet et le refuse à la validation", () => {
    const now = zonedTime("2026-10-17", "11:02");
    const start = zonedTime("2026-10-17", "11:30").toISOString();
    const days = computeSlots({ now, settings: { ...settings, maxOrdersPerSlot: 2 }, hours, closures: [], taken: new Map([[start, 2]]) });
    expect(days[0]!.slots[0]!.full).toBe(true);
    expect(findAvailableSlot(days, start)).toBeNull();
    expect(findAvailableSlot(days, zonedTime("2026-10-17", "11:45").toISOString())).not.toBeNull();
  });

  it("gère le passage à l'heure d'hiver (25 octobre 2026)", () => {
    const now = zonedTime("2026-10-24", "22:00");
    const days = computeSlots({ now, settings, hours, closures: [] });
    const dimanche = days.find((d) => d.date === "2026-10-25")!;
    expect(dimanche.slots[0]!.label).toBe("10:30");
    expect(dimanche.slots[0]!.start.toISOString()).toBe("2026-10-25T09:30:00.000Z"); // UTC+1
    expect(localDate(dimanche.slots[0]!.start)).toBe("2026-10-25");
  });

  it("indique si le restaurant est ouvert", () => {
    expect(isOpenAt(zonedTime("2026-10-17", "12:00"), hours, [], "Europe/Paris")).toBe(true);
    expect(isOpenAt(zonedTime("2026-10-17", "15:00"), hours, [], "Europe/Paris")).toBe(false);
    expect(isOpenAt(zonedTime("2026-10-19", "12:00"), hours, [], "Europe/Paris")).toBe(false); // lundi
  });
});

describe("statuts de commande", () => {
  it("suit le parcours retrait et livraison", () => {
    expect(primaryNext("PREPARING", "PICKUP")).toBe("READY");
    expect(primaryNext("PREPARING", "DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(primaryNext("READY", "PICKUP")).toBe("COMPLETED");
  });
  it("interdit « en livraison » pour un retrait et tout retour arrière", () => {
    expect(canTransition("READY", "OUT_FOR_DELIVERY", "PICKUP")).toBe(false);
    expect(canTransition("COMPLETED", "NEW", "PICKUP")).toBe(false);
    expect(canTransition("CANCELLED", "NEW", "DELIVERY")).toBe(false);
    expect(allowedTransitions("NEW", "DELIVERY")).toContain("CANCELLED");
  });
});

describe("droits des rôles", () => {
  const employe: Actor = { id: "e", role: "EMPLOYEE", restaurantIds: ["r1"] };
  const gerant: Actor = { id: "g", role: "MANAGER", restaurantIds: ["r1"] };
  const proprio: Actor = { id: "p", role: "OWNER", restaurantIds: [] };

  it("employé : commandes et ruptures de son restaurant uniquement", () => {
    expect(can(employe, "orders.update", "r1")).toBe(true);
    expect(can(employe, "stock.toggle", "r1")).toBe(true);
    expect(can(employe, "orders.view", "r2")).toBe(false);
    expect(can(employe, "menu.edit")).toBe(false);
    expect(can(employe, "accounting.view", "r1")).toBe(false);
    expect(can(employe, "orders.refund", "r1")).toBe(false);
  });
  it("gérant : ses restaurants, pas les utilisateurs ni la technique", () => {
    expect(can(gerant, "accounting.view", "r1")).toBe(true);
    expect(can(gerant, "restaurant.settings", "r2")).toBe(false);
    expect(can(gerant, "users.manage")).toBe(false);
    expect(can(gerant, "tech.config")).toBe(false);
  });
  it("propriétaire : tous les restaurants", () => {
    expect(can(proprio, "accounting.close", "r9")).toBe(true);
    expect(restaurantScope(proprio)).toEqual({});
    expect(restaurantScope(gerant)).toEqual({ id: { in: ["r1"] } });
  });
  it("on ne crée pas de compte au-dessus de soi", () => {
    expect(canManageRole(proprio, "SUPER_ADMIN")).toBe(false);
    expect(canManageRole(proprio, "EMPLOYEE")).toBe(true);
    expect(canManageRole(gerant, "EMPLOYEE")).toBe(false);
  });
});
