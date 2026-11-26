import "server-only";
import { z } from "zod";
import { audit } from "./audit";
import { priceCart, type CartError, type PromoRule } from "./cart";
import { readConfig } from "./config";
import { randomToken } from "./crypto";
import { db, type Tx } from "./db";
import { enqueue } from "./jobs";
import { onLoyaltyStatus } from "./loyalty";
import { catalogMap, loadMenu } from "./menu";
import { onOrderConfirmed } from "./orders/notify";
import { GENESIS, POS_METHODS, settle, ticketHash } from "./pos-rules";
import { localDate, localHHMM } from "./time";

export { POS_METHODS, settle, ticketHash, type PosMethod } from "./pos-rules";

/**
 * Caisse : vente au comptoir. Le prix est recalculé ici (comme sur le site), la vente est
 * réglée immédiatement (espèces, TPE, titres-restaurant, paiement partagé), numérotée sans trou
 * et chaînée par empreinte au ticket précédent du restaurant (inaltérabilité). Une vente ne
 * se modifie ni ne se supprime : une erreur se corrige par un avoir (remboursement).
 */

/** Imprimantes capables d'imprimer un ticket client et d'ouvrir le tiroir (le serveur leur envoie le contenu). */
export const RECEIPT_METHODS = ["LOCAL_AGENT", "DIRECT_TCP", "PRINTNODE", "STAR_CLOUDPRNT", "EPSON_SDP"] as const;

export const PosSaleInput = z.object({
  restaurantId: z.string().min(1).max(40),
  mode: z.enum(["DINE_IN", "PICKUP"]),
  table: z.string().trim().max(20).default(""),
  lines: z
    .array(z.object({
      productId: z.string().min(1).max(40),
      variantId: z.string().max(40).nullish(),
      optionIds: z.array(z.string().max(40)).max(20).optional(),
      quantity: z.number().int().min(1).max(500),
    }))
    .min(1, "Le ticket est vide.")
    .max(150),
  customerId: z.string().max(40).nullish(),
  notes: z.string().trim().max(300).default(""),
  discount: z.object({ type: z.enum(["PERCENT", "AMOUNT"]), value: z.number().int().min(1).max(1_000_000) }).nullish(),
  payments: z.array(z.object({ method: z.enum(POS_METHODS), amountCents: z.number().int().min(1).max(10_000_000) })).min(1, "Choisissez un règlement.").max(8),
  sendToKitchen: z.boolean().default(true),
  receiptPrinterId: z.string().max(40).nullish(),
  printReceipt: z.boolean().default(false),
  extrasDeclined: z.boolean().default(false),
});
export type PosSaleInput = z.infer<typeof PosSaleInput>;

export type PosSaleResult =
  | { ok: true; orderId: string; reference: string; number: number; dailyNumber: number; totalCents: number; changeCents: number }
  | { ok: false; message: string; errors?: CartError[] };

/** Vérifie la chaîne des tickets de caisse d'un restaurant ; renvoie la 1re référence altérée, ou null. */
export async function verifyTicketChain(restaurantId: string): Promise<string | null> {
  const all = await db.order.findMany({
    where: { restaurantId, source: "POS", chainHash: { not: "" } },
    orderBy: { number: "asc" },
    include: { lines: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { createdAt: "asc" } } },
  });
  let prev = GENESIS;
  for (const o of all) {
    const payments = o.payments.filter((p) => p.status === "SUCCEEDED");
    if (o.chainPrev !== prev || o.chainHash !== ticketHash(prev, { ...o, payments })) return o.reference;
    prev = o.chainHash;
  }
  return null;
}

async function nextCounter(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1 RETURNING "value"`;
  return rows[0]!.value;
}

/** Met en file un travail pour une imprimante (ticket client, tiroir…). */
export async function queuePrinterJob(tx: Tx, printer: { id: string; method: string; copies: number }, orderId: string, kind: string) {
  const job = await tx.printJob.create({ data: { orderId, printerId: printer.id, copies: 1, kind } });
  if (printer.method === "PRINTNODE") await enqueue("printnode", { printJobId: job.id }, tx);
  if (printer.method === "DIRECT_TCP") await enqueue("printdirect", { printJobId: job.id }, tx);
  return job;
}

type Restaurant = NonNullable<Awaited<ReturnType<typeof db.restaurant.findUnique>>>;

/** Prix d'un ticket de caisse, calculé comme sur le site (petits plus offerts, remise ventilée par TVA). */
async function priceSale(restaurant: Restaurant, input: Pick<PosSaleInput, "mode" | "lines" | "discount">, now: Date) {
  const config = await readConfig();
  const menu = await loadMenu(restaurant.id);
  const period = localHHMM(now, restaurant.timezone) < "16:00" ? "LUNCH" : "DINNER";

  // Remise manuelle au comptoir : appliquée comme une remise de code promo (ventilée par taux de TVA).
  const promo: PromoRule | null = input.discount ? {
    code: "REMISE", type: input.discount.type, value: input.discount.type === "PERCENT" ? Math.min(100, input.discount.value) : input.discount.value,
    minSubtotalCents: 0, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, active: true, restaurantIds: [],
  } : null;
  const cart = priceCart(input.lines, catalogMap(menu), {
    restaurantId: restaurant.id, mode: input.mode, period, zone: null, pickupMinimumCents: 0,
    noAlcoholDelivery: false, promo, now, maxLineQuantity: 500, extrasRule: config.extras,
  });
  // Au comptoir, la période (midi / soir) n'est pas bloquante : le vendeur sert ce qu'il a.
  const blocking = cart.errors.filter((e) => e.code !== "NOT_FOR_PERIOD" && e.code !== "MINIMUM_NOT_REACHED");
  return { cart, period, blocking } as const;
}

/** Aperçu du ticket (montants exacts avant l'encaissement). */
export async function previewSale(raw: unknown, now = new Date()) {
  const parsed = PosSaleInput.pick({ restaurantId: true, mode: true, lines: true, discount: true }).safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Ticket incomplet." };
  const restaurant = await db.restaurant.findUnique({ where: { id: parsed.data.restaurantId } });
  if (!restaurant) return { ok: false as const, message: "Restaurant introuvable." };
  const { cart, blocking } = await priceSale(restaurant, parsed.data, now);
  if (blocking.length) return { ok: false as const, message: blocking[0]!.message };
  return {
    ok: true as const, subtotalCents: cart.subtotalCents, discountCents: cart.discountCents, extrasDiscountCents: cart.extrasDiscountCents,
    totalCents: cart.totalCents, lines: cart.lines.map((l) => ({ productId: l.productId, totalCents: l.totalCents })),
  };
}

export async function sellAtCounter(raw: unknown, actor: { userId: string; label: string; ip?: string }, now = new Date()): Promise<PosSaleResult> {
  const parsed = PosSaleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vente incomplète." };
  const input = parsed.data;

  const restaurant = await db.restaurant.findUnique({ where: { id: input.restaurantId } });
  if (!restaurant || restaurant.archivedAt) return { ok: false, message: "Restaurant introuvable." };
  const { cart, period, blocking } = await priceSale(restaurant, input, now);
  if (blocking.length) return { ok: false, message: blocking[0]!.message, errors: blocking };

  const settled = settle(cart.totalCents, input.payments);
  if (!settled.ok) return { ok: false, message: settled.message };
  const primary = [...settled.records].sort((a, b) => b.amountCents - a.amountCents)[0]?.method ?? "CASH";

  const customer = input.customerId ? await db.customer.findUnique({ where: { id: input.customerId }, select: { id: true, firstName: true, lastName: true, phone: true } }) : null;
  const receiptPrinter = input.receiptPrinterId
    ? await db.printer.findFirst({ where: { id: input.receiptPrinterId, restaurantId: restaurant.id, active: true, method: { in: [...RECEIPT_METHODS] } } })
    : null;
  const status = input.sendToKitchen ? ((await readConfig()).orders.acceptToPreparing ? "PREPARING" : "ACCEPTED") : "COMPLETED";

  const order = await db.$transaction(async (tx) => {
    // Un ticket à la fois par restaurant : numéro et chaînage sans trou ni croisement.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pos:" + restaurant.id}))`;
    const number = await nextCounter(tx, `order:${restaurant.id}`);
    const dailyNumber = await nextCounter(tx, `daily:${restaurant.id}:${localDate(now, restaurant.timezone)}`);
    const reference = `YS-${restaurant.slug.slice(0, 3).toUpperCase()}-${String(number).padStart(6, "0")}`;
    const last = await tx.order.findFirst({ where: { restaurantId: restaurant.id, source: "POS", chainHash: { not: "" } }, orderBy: { number: "desc" }, select: { chainHash: true } });
    const chainPrev = last?.chainHash ?? GENESIS;
    const lines = cart.lines.map((l, i) => ({
      productId: l.productId, variantId: l.variantId, name: l.name, variantLabel: l.variantLabel, options: l.options,
      categoryName: l.categoryName, unitPriceCents: l.unitPriceCents, quantity: l.quantity, vatRate: l.vatRate,
      totalCents: l.totalCents, isAlcohol: l.isAlcohol, sortOrder: i,
    }));
    const chainHash = ticketHash(chainPrev, { reference, number, placedAt: now, totalCents: cart.totalCents, vatBreakdown: cart.vatBreakdown, lines, payments: settled.records });
    const created = await tx.order.create({
      data: {
        restaurantId: restaurant.id, number, dailyNumber, reference, trackingToken: randomToken(24),
        source: "POS", status, paymentStatus: "PAID", paymentMethod: primary, mode: input.mode, period,
        slotStart: now, slotEnd: now, placedAt: now, acceptedAt: now, completedAt: status === "COMPLETED" ? now : null,
        customerId: customer?.id ?? null,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : input.table ? `Table ${input.table}` : "Comptoir",
        customerPhone: customer?.phone ?? "", customerEmail: "",
        notes: input.notes, promoCode: cart.promoApplied ?? "",
        subtotalCents: cart.subtotalCents, discountCents: cart.discountCents, extrasDiscountCents: cart.extrasDiscountCents,
        deliveryFeeCents: 0, totalCents: cart.totalCents, vatBreakdown: cart.vatBreakdown as unknown as object,
        ageConfirmed: true, extrasDeclined: input.extrasDeclined && cart.extrasCount === 0,
        tableLabel: input.table, changeCents: settled.changeCents, chainPrev, chainHash,
        lines: { create: lines },
        payments: { create: settled.records.map((p) => ({ method: p.method, amountCents: p.amountCents, status: "SUCCEEDED" as const, recordedById: actor.userId })) },
        statusEvents: { create: { from: null, to: status, userId: actor.userId, actor: actor.label, note: "Vente au comptoir" } },
      },
    });
    // Ticket de préparation (imprimantes en impression automatique), sans e-mail d'alerte.
    await onOrderConfirmed(tx, created, { alerts: false, print: input.sendToKitchen });
    if (receiptPrinter && input.printReceipt) await queuePrinterJob(tx, receiptPrinter, created.id, "RECEIPT");
    else if (receiptPrinter && settled.records.some((p) => p.method === "CASH")) await queuePrinterJob(tx, receiptPrinter, created.id, "DRAWER");
    if (status === "COMPLETED") await onLoyaltyStatus(tx, created, "COMPLETED");
    await audit({ userId: actor.userId, actor: actor.label, action: "pos.sale", entityType: "Order", entityId: created.id, restaurantId: restaurant.id,
      data: { reference, total: cart.totalCents, payments: settled.records, change: settled.changeCents, discount: cart.discountCents, chainHash }, ip: actor.ip }, tx);
    return created;
  });
  return { ok: true, orderId: order.id, reference: order.reference, number: order.number, dailyNumber: order.dailyNumber, totalCents: order.totalCents, changeCents: order.changeCents };
}
