import "server-only";
import { createHash } from "node:crypto";
import { buildReport, type Grouping, type SaleRow } from "./accounting";
import { canonicalJson } from "./audit";
import { db } from "./db";
import type { VatLine } from "./money";
import { onLoyaltyStatus } from "./loyalty";
import { addDays, localDate, zonedTime } from "./time";

/**
 * Commandes comptabilisées par CE système : l'historique importé de l'ancien site (WooCommerce)
 * reste consultable mais n'entre ni dans la comptabilité, ni dans les clôtures, ni dans les exports.
 */
export const ACCOUNTED = { source: { not: "IMPORT_WP" as const } };

/** Ventes confirmées dont la date de service est comprise entre from et to (inclus, AAAA-MM-JJ). */
export async function loadSales(restaurantIds: string[], from: string, to: string) {
  const orders = await db.order.findMany({
    where: {
      ...ACCOUNTED,
      restaurantId: { in: restaurantIds },
      status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] },
      slotStart: { gte: zonedTime(from, "00:00"), lt: zonedTime(addDays(to, 1), "00:00") },
    },
    include: { lines: { select: { name: true, variantLabel: true, categoryName: true, quantity: true, unitPriceCents: true, vatRate: true, totalCents: true }, orderBy: { sortOrder: "asc" } } },
    orderBy: { slotStart: "asc" },
  });
  return orders;
}

export async function loadRefunds(restaurantIds: string[], from: string, to: string) {
  return db.refund.findMany({
    where: { order: { ...ACCOUNTED, restaurantId: { in: restaurantIds } }, createdAt: { gte: zonedTime(from, "00:00"), lt: zonedTime(addDays(to, 1), "00:00") } },
    include: { order: { select: { reference: true, restaurantId: true, paymentMethod: true, totalCents: true, vatBreakdown: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function reportFor(restaurantIds: string[], from: string, to: string, grouping: Grouping) {
  const [orders, refunds] = await Promise.all([loadSales(restaurantIds, from, to), loadRefunds(restaurantIds, from, to)]);
  const rows: SaleRow[] = orders.map((o) => ({ ...o, vatBreakdown: o.vatBreakdown as unknown as VatLine[] }));
  return { report: buildReport(rows, refunds, grouping), orders, refunds };
}

const GENESIS = "0".repeat(64);

/**
 * Clôture journalière : fige les totaux du jour (date de service), chaînés par empreinte
 * avec la clôture précédente du restaurant. Une clôture ne peut être ni refaite ni modifiée.
 */
export async function closeDay(restaurantId: string, date: string, closedById: string | null) {
  const { report } = await reportFor([restaurantId], date, date, "day");
  const pending = await db.order.count({
    where: { ...ACCOUNTED, restaurantId, status: { in: ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] }, slotStart: { gte: zonedTime(date, "00:00"), lt: zonedTime(addDays(date, 1), "00:00") } },
  });
  if (pending > 0) throw new Error(`${pending} commande(s) de ce jour ne sont pas terminées ou annulées.`);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"closure:" + restaurantId}))`;
    if (await tx.dailyClosure.findUnique({ where: { restaurantId_date: { restaurantId, date } } })) throw new Error("Cette journée est déjà clôturée.");
    const last = await tx.dailyClosure.findFirst({ where: { restaurantId }, orderBy: { closedAt: "desc" }, select: { hash: true, date: true } });
    if (last && last.date > date) throw new Error("Une journée plus récente est déjà clôturée.");
    const totals = {
      orders: report.orders, ttc: report.ttc, ht: report.ht, vat: report.vat, refunds: report.refunds, net: report.netTtc,
      byVat: report.byVat, byMode: report.byMode, byPayment: report.byPayment,
    };
    const previousHash = last?.hash ?? GENESIS;
    const hash = createHash("sha256").update(canonicalJson([previousHash, restaurantId, date, totals])).digest("hex");
    return tx.dailyClosure.create({
      data: { restaurantId, date, totals, ordersCount: report.orders, totalCents: report.ttc, previousHash, hash, closedById },
    });
  });
}

/**
 * Clôture journalière automatique (tâche planifiée, chaque nuit) : pour chaque restaurant, clôture
 * les journées passées pas encore clôturées (rattrapage limité à 62 jours). Les commandes du jour
 * restées « en cours » sont d'abord passées « Terminées » (le service est fini), avec une trace.
 */
export async function autoCloseDays(now = new Date()): Promise<string[]> {
  const done: string[] = [];
  const restaurants = await db.restaurant.findMany({ where: { archivedAt: null }, select: { id: true, name: true, timezone: true } });
  for (const r of restaurants) {
    const yesterday = addDays(localDate(now, r.timezone), -1);
    const last = await db.dailyClosure.findFirst({ where: { restaurantId: r.id }, orderBy: { date: "desc" }, select: { date: true } });
    let day = last ? addDays(last.date, 1) : yesterday;
    for (let n = 0; day <= yesterday && n < 62; n++, day = addDays(day, 1)) {
      try {
        const leftovers = await db.order.findMany({
          where: { ...ACCOUNTED, restaurantId: r.id, status: { in: ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] }, slotStart: { gte: zonedTime(day, "00:00"), lt: zonedTime(addDays(day, 1), "00:00") } },
        });
        for (const o of leftovers) {
          await db.$transaction(async (tx) => {
            const updated = await tx.order.update({ where: { id: o.id }, data: { status: "COMPLETED", completedAt: new Date() } });
            await tx.orderStatusEvent.create({ data: { orderId: o.id, from: o.status, to: "COMPLETED", actor: "Système", note: "Terminée automatiquement à la clôture du jour" } });
            await onLoyaltyStatus(tx, updated, "COMPLETED");
          });
        }
        await closeDay(r.id, day, null);
        done.push(`${r.name} ${day}`);
      } catch (e) {
        console.error(`[clôture auto] ${r.name} ${day}`, e);
        break; // on ne saute pas un jour : la chaîne reste continue
      }
    }
  }
  return done;
}

/** Vérifie la chaîne des clôtures d'un restaurant. */
export async function verifyClosures(restaurantId: string): Promise<string | null> {
  const all = await db.dailyClosure.findMany({ where: { restaurantId }, orderBy: { closedAt: "asc" } });
  let prev = GENESIS;
  for (const c of all) {
    const expected = createHash("sha256").update(canonicalJson([prev, restaurantId, c.date, c.totals])).digest("hex");
    if (c.previousHash !== prev || c.hash !== expected) return c.date;
    prev = c.hash;
  }
  return null;
}

/** Commandes annulées (du nouveau site) dont la date de service tombe dans la période. */
export async function loadCancellations(restaurantIds: string[], from: string, to: string) {
  return db.order.findMany({
    where: { ...ACCOUNTED, restaurantId: { in: restaurantIds }, status: "CANCELLED", slotStart: { gte: zonedTime(from, "00:00"), lt: zonedTime(addDays(to, 1), "00:00") } },
    select: { reference: true, restaurantId: true, slotStart: true, cancelledAt: true, cancelReason: true, totalCents: true, paymentMethod: true, paymentStatus: true, customerName: true },
    orderBy: { slotStart: "asc" },
  });
}

/** Clôtures journalières de la période. */
export async function loadClosures(restaurantIds: string[], from: string, to: string) {
  return db.dailyClosure.findMany({
    where: { restaurantId: { in: restaurantIds }, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { restaurantId: "asc" }],
  });
}
