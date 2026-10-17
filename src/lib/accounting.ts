import type { VatLine } from "./money";
import { localDate } from "./time";

/**
 * Synthèses comptables. Une vente est rattachée à sa DATE DE SERVICE (créneau, heure de Paris).
 * Sont comptées les commandes confirmées (ni annulées, ni en attente de paiement).
 * Les remboursements (avoirs) sont présentés à part, à leur date d'émission.
 */

export interface SaleRow {
  slotStart: Date;
  mode: "PICKUP" | "DELIVERY" | "DINE_IN";
  paymentMethod: string;
  paymentStatus: string;
  totalCents: number;
  vatBreakdown: VatLine[];
  lines: { name: string; quantity: number; totalCents: number }[];
}

export interface RefundRow {
  createdAt: Date;
  amountCents: number;
}

export type Grouping = "day" | "week" | "month";

export interface Bucket {
  key: string;
  label: string;
  orders: number;
  ttc: number;
  ht: number;
  vat: number;
}

/** Lundi de la semaine ISO d'une date « AAAA-MM-JJ ». */
function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const shift = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - shift);
  return t.toISOString().slice(0, 10);
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function bucketOf(date: string, g: Grouping): { key: string; label: string } {
  if (g === "day") return { key: date, label: date.split("-").reverse().join("/") };
  if (g === "week") {
    const w = weekStart(date);
    return { key: w, label: `Semaine du ${w.split("-").reverse().join("/")}` };
  }
  const [y, m] = date.split("-") as [string, string];
  return { key: `${y}-${m}`, label: `${MONTHS[Number(m) - 1]} ${y}` };
}

export interface Report {
  orders: number;
  ttc: number;
  ht: number;
  vat: number;
  averageBasket: number;
  refunds: number;
  netTtc: number;
  buckets: Bucket[];
  byMode: Record<string, { orders: number; ttc: number }>;
  byPayment: Record<string, { orders: number; ttc: number; paid: number }>;
  byVat: { rate: number; ht: number; vat: number; ttc: number }[];
  topProducts: { name: string; quantity: number; ttc: number }[];
}

export function buildReport(sales: SaleRow[], refunds: RefundRow[], grouping: Grouping, tz = "Europe/Paris"): Report {
  const buckets = new Map<string, Bucket>();
  const byMode: Report["byMode"] = {};
  const byPayment: Report["byPayment"] = {};
  const vat = new Map<number, { ht: number; vat: number; ttc: number }>();
  const products = new Map<string, { quantity: number; ttc: number }>();
  let ttc = 0;
  let ht = 0;
  let vatTotal = 0;

  for (const s of sales) {
    const { key, label } = bucketOf(localDate(s.slotStart, tz), grouping);
    const b = buckets.get(key) ?? { key, label, orders: 0, ttc: 0, ht: 0, vat: 0 };
    const sHt = s.vatBreakdown.reduce((a, v) => a + v.baseCents, 0);
    const sVat = s.vatBreakdown.reduce((a, v) => a + v.vatCents, 0);
    b.orders++;
    b.ttc += s.totalCents;
    b.ht += sHt;
    b.vat += sVat;
    buckets.set(key, b);
    ttc += s.totalCents;
    ht += sHt;
    vatTotal += sVat;

    const m = (byMode[s.mode] ??= { orders: 0, ttc: 0 });
    m.orders++;
    m.ttc += s.totalCents;
    const p = (byPayment[s.paymentMethod] ??= { orders: 0, ttc: 0, paid: 0 });
    p.orders++;
    p.ttc += s.totalCents;
    if (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(s.paymentStatus)) p.paid += s.totalCents;

    for (const v of s.vatBreakdown) {
      const r = vat.get(v.rate) ?? { ht: 0, vat: 0, ttc: 0 };
      r.ht += v.baseCents;
      r.vat += v.vatCents;
      r.ttc += v.totalCents;
      vat.set(v.rate, r);
    }
    for (const l of s.lines) {
      const pr = products.get(l.name) ?? { quantity: 0, ttc: 0 };
      pr.quantity += l.quantity;
      pr.ttc += l.totalCents;
      products.set(l.name, pr);
    }
  }
  const refundTotal = refunds.reduce((a, r) => a + r.amountCents, 0);

  return {
    orders: sales.length,
    ttc,
    ht,
    vat: vatTotal,
    averageBasket: sales.length ? Math.round(ttc / sales.length) : 0,
    refunds: refundTotal,
    netTtc: ttc - refundTotal,
    buckets: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byMode,
    byPayment,
    byVat: [...vat.entries()].sort(([a], [b]) => a - b).map(([rate, v]) => ({ rate, ...v })),
    topProducts: [...products.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.ttc - a.ttc || b.quantity - a.quantity).slice(0, 20), // par chiffre d'affaires
  };
}

/** CSV compatible Excel (France) : séparateur « ; », virgule décimale, BOM UTF-8. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export const centsToEuros = (c: number) => Math.round(c) / 100;
