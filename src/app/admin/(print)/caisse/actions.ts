"use server";

import { actorOf, authorize, logAction } from "@/lib/admin";
import { clientIp } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { balanceOf } from "@/lib/loyalty";
import { previewSale, queuePrinterJob, RECEIPT_METHODS, sellAtCounter, type PosSaleResult } from "@/lib/pos";
import { addDays, localDate, zonedTime } from "@/lib/time";

type Result = { ok: true; message: string } | { ok: false; message: string };

/** Encaisser une vente au comptoir. */
export async function posSaleAction(input: { restaurantId: string } & Record<string, unknown>): Promise<PosSaleResult> {
  try {
    const staff = await authorize("pos.sell", String(input.restaurantId));
    return await sellAtCounter(input, actorOf(staff, await clientIp()));
  } catch (e) {
    return { ok: false, message: (e as Error).message || "Vente impossible." };
  }
}

/** Montants exacts du ticket en cours (petits plus offerts, remise). */
export async function posPreviewAction(input: { restaurantId: string } & Record<string, unknown>) {
  await authorize("pos.sell", String(input.restaurantId));
  return previewSale(input);
}

/** Client de la carte de fidélité : n° de carte (scan) ou téléphone. */
export async function posFindCustomerAction(restaurantId: string, query: string) {
  await authorize("pos.sell", restaurantId);
  const q = query.replace(/\s/g, "");
  if (q.length < 6) return null;
  const digits = q.replace(/\D/g, "");
  const customer = await db.customer.findFirst({
    where: {
      anonymizedAt: null,
      OR: [
        ...(digits.length === 12 ? [{ cardNumber: digits }] : []),
        { phone: { contains: digits.slice(-9) } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, phone: true, cardNumber: true },
  });
  if (!customer) return null;
  return { ...customer, points: await balanceOf(customer.id) };
}

/** Tickets de caisse du jour (réimpression, totaux par règlement). */
export async function posTodayAction(restaurantId: string) {
  await authorize("pos.sell", restaurantId);
  const today = localDate(new Date());
  const orders = await db.order.findMany({
    where: { restaurantId, source: "POS", placedAt: { gte: zonedTime(today, "00:00"), lt: zonedTime(addDays(today, 1), "00:00") } },
    orderBy: { number: "desc" },
    include: { payments: { where: { status: "SUCCEEDED" } } },
    take: 300,
  });
  const byMethod: Record<string, number> = {};
  let total = 0;
  for (const o of orders.filter((x) => x.status !== "CANCELLED")) {
    total += o.totalCents;
    for (const p of o.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
  }
  return {
    total,
    byMethod,
    tickets: orders.map((o) => ({
      id: o.id, number: o.number, dailyNumber: o.dailyNumber, reference: o.reference, status: o.status,
      at: o.placedAt.toISOString(), totalCents: o.totalCents, table: o.tableLabel, customer: o.customerName,
      methods: o.payments.map((p) => p.method),
    })),
  };
}

async function receiptPrinter(restaurantId: string, printerId: string) {
  return db.printer.findFirst({ where: { id: printerId, restaurantId, active: true, method: { in: [...RECEIPT_METHODS] } } });
}

/** Réimpression du ticket client (mention « DUPLICATA »). */
export async function posReprintAction(orderId: string, printerId: string): Promise<Result> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, restaurantId: true, reference: true, source: true } });
  if (!order || order.source !== "POS") return { ok: false, message: "Ticket introuvable." };
  const staff = await authorize("pos.sell", order.restaurantId);
  const printer = await receiptPrinter(order.restaurantId, printerId);
  if (!printer) return { ok: false, message: "Choisissez l'imprimante des tickets (réglages de la caisse)." };
  await db.$transaction((tx) => queuePrinterJob(tx, printer, order.id, "RECEIPT_DUP"));
  await logAction(staff, "pos.reprint", "Order", order.id, order.restaurantId, { reference: order.reference });
  return { ok: true, message: `Duplicata du ticket ${order.reference} envoyé.` };
}

/** Ticket client d'une vente déjà encaissée (le client le demande après coup). */
export async function posReceiptAction(orderId: string, printerId: string): Promise<Result> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, restaurantId: true, source: true, printJobs: { where: { kind: { in: ["RECEIPT", "RECEIPT_DUP"] } }, select: { id: true } } } });
  if (!order || order.source !== "POS") return { ok: false, message: "Ticket introuvable." };
  const staff = await authorize("pos.sell", order.restaurantId);
  const printer = await receiptPrinter(order.restaurantId, printerId);
  if (!printer) return { ok: false, message: "Choisissez l'imprimante des tickets (réglages de la caisse)." };
  // Le premier ticket remis est l'original, les suivants sont des duplicatas.
  await db.$transaction((tx) => queuePrinterJob(tx, printer, order.id, order.printJobs.length ? "RECEIPT_DUP" : "RECEIPT"));
  await logAction(staff, "pos.receipt", "Order", order.id, order.restaurantId, {});
  return { ok: true, message: "Ticket envoyé à l'imprimante." };
}

/** Ouverture du tiroir-caisse sans vente (tracée dans le journal). */
export async function posDrawerAction(restaurantId: string, printerId: string, reason: string): Promise<Result> {
  const staff = await authorize("pos.sell", restaurantId);
  if (!reason.trim()) return { ok: false, message: "Indiquez le motif d'ouverture du tiroir." };
  const printer = await receiptPrinter(restaurantId, printerId);
  if (!printer) return { ok: false, message: "Choisissez l'imprimante des tickets (réglages de la caisse)." };
  const anchor = await db.order.findFirst({ where: { restaurantId }, orderBy: { placedAt: "desc" }, select: { id: true } });
  if (!anchor) return { ok: false, message: "Aucune vente enregistrée pour l'instant." };
  await db.$transaction((tx) => queuePrinterJob(tx, printer, anchor.id, "DRAWER"));
  await logAction(staff, "pos.drawer", "Restaurant", restaurantId, restaurantId, { reason: reason.slice(0, 200) });
  return { ok: true, message: "Tiroir ouvert." };
}
