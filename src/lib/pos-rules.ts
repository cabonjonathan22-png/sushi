import { createHash } from "node:crypto";
import { canonicalJson } from "./audit";

/** Règles pures de la caisse (testables) : règlements, monnaie rendue, empreinte chaînée des tickets. */

export const POS_METHODS = ["CASH", "CARD_TERMINAL", "MEAL_VOUCHER_PAPER", "MEAL_VOUCHER_CARD"] as const;
export type PosMethod = (typeof POS_METHODS)[number];

export const GENESIS = "0".repeat(64);

/**
 * Répartit les règlements : la carte et les titres-restaurant ne dépassent jamais le reste dû ;
 * l'excédent d'espèces est rendu (monnaie). Renvoie les montants réellement encaissés.
 */
export function settle(totalCents: number, payments: { method: PosMethod; amountCents: number }[]):
  { ok: true; records: { method: PosMethod; amountCents: number }[]; changeCents: number } | { ok: false; message: string } {
  const cash = payments.filter((p) => p.method === "CASH").reduce((a, p) => a + p.amountCents, 0);
  const other = payments.filter((p) => p.method !== "CASH").reduce((a, p) => a + p.amountCents, 0);
  if (other > totalCents) return { ok: false, message: "La carte et les titres-restaurant dépassent le montant dû." };
  const due = totalCents - other;
  if (cash < due) return { ok: false, message: `Il manque ${((due - cash) / 100).toFixed(2).replace(".", ",")} €.` };
  const change = cash - due;
  const merged = new Map<PosMethod, number>();
  for (const p of payments) merged.set(p.method, (merged.get(p.method) ?? 0) + p.amountCents);
  if (merged.has("CASH")) merged.set("CASH", merged.get("CASH")! - change);
  const records = [...merged.entries()].filter(([, a]) => a > 0).map(([method, amountCents]) => ({ method, amountCents }));
  return { ok: true, records, changeCents: change };
}

/** Empreinte d'un ticket : chaînée à la précédente, sur tout ce qui fait foi (montants, lignes, règlements, date). */
export function ticketHash(prev: string, t: {
  reference: string; number: number; placedAt: Date; totalCents: number; vatBreakdown: unknown;
  lines: { name: string; quantity: number; totalCents: number; vatRate: number }[]; payments: { method: string; amountCents: number }[];
}): string {
  return createHash("sha256").update(canonicalJson([
    prev, t.reference, t.number, t.placedAt.toISOString(), t.totalCents, t.vatBreakdown,
    t.lines.map((l) => [l.name, l.quantity, l.totalCents, l.vatRate]), t.payments.map((p) => [p.method, p.amountCents]),
  ])).digest("hex");
}

