import type Stripe from "stripe";
import { audit } from "../audit";
import { readConfig } from "../config";
import { db, type Tx } from "../db";
import { onLoyaltyRefund, onLoyaltyStatus } from "../loyalty";
import { canTransition, previousStatus, type OrderStatus } from "../order-status";
import { localDate } from "../time";
import { stripeFor } from "../payments/stripe";
import { onOrderConfirmed, onStatusChanged } from "./notify";

/**
 * Opérations sur une commande validée. Les montants ne changent jamais :
 * seuls le statut et les paiements évoluent, toujours tracés (historique + journal).
 */

export interface ActorInfo {
  userId: string | null;
  label: string;
  ip?: string;
}

export class OrderError extends Error {}

const TIMESTAMP: Partial<Record<OrderStatus, "acceptedAt" | "readyAt" | "completedAt" | "cancelledAt">> = {
  ACCEPTED: "acceptedAt",
  READY: "readyAt",
  COMPLETED: "completedAt",
  CANCELLED: "cancelledAt",
};

async function setStatus(tx: Tx, orderId: string, wanted: OrderStatus, actor: ActorInfo, note = "", back = false) {
  // Verrou de ligne : deux employés qui cliquent en même temps ne créent pas d'incohérence.
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  if (!rows.length) throw new OrderError("Commande introuvable.");
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  // « Accepter » mène directement « En préparation » si la Configuration le demande.
  const to: OrderStatus = !back && wanted === "ACCEPTED" && (await readConfig()).orders.acceptToPreparing && canTransition(order.status, "PREPARING", order.mode) ? "PREPARING" : wanted;
  if (order.status === to) return order;
  if (back ? previousStatus(order.status, order.mode) !== to : !canTransition(order.status, to, order.mode)) {
    throw new OrderError(`Passage impossible de « ${order.status} » à « ${to} ».`);
  }
  if (back && order.status === "COMPLETED") {
    // Une journée clôturée (comptabilité) ne se rouvre pas.
    const day = localDate(order.slotStart);
    if (await tx.dailyClosure.findUnique({ where: { restaurantId_date: { restaurantId: order.restaurantId, date: day } } })) {
      throw new OrderError("Cette journée est déjà clôturée : la commande ne peut plus revenir en arrière.");
    }
  }
  const ts = back ? undefined : TIMESTAMP[to];
  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      status: to,
      ...(ts ? { [ts]: new Date() } : {}),
      ...(to === "PREPARING" && !order.acceptedAt ? { acceptedAt: new Date() } : {}),
      ...(back && order.status === "COMPLETED" ? { completedAt: null } : {}),
      ...(back && order.status === "READY" ? { readyAt: null } : {}),
      ...(to === "CANCELLED" ? { cancelReason: note.slice(0, 300) } : {}),
    },
  });
  await tx.orderStatusEvent.create({ data: { orderId, from: order.status, to, userId: actor.userId, actor: actor.label, note: (back ? `Retour en arrière${note ? ` : ${note}` : ""}` : note).slice(0, 300) } });
  await audit({ userId: actor.userId, actor: actor.label, action: back ? "order.status_back" : "order.status", entityType: "Order", entityId: orderId,
    restaurantId: order.restaurantId, data: { from: order.status, to, note }, ip: actor.ip }, tx);
  if (back) return updated; // retour en arrière : ni e-mail au client, ni points
  // Fidélité : points gagnés à la remise, rendus / retirés à l'annulation.
  await onLoyaltyStatus(tx, updated, to);
  if (order.status === "PENDING_PAYMENT" && to === "NEW") await onOrderConfirmed(tx, updated);
  else await onStatusChanged(tx, updated, to);
  // « Prête » enchaîne toute seule (Configuration) : livraison → « En livraison » (e-mail) → « Terminée » ;
  // retrait / sur place → « Terminée » (l'e-mail « prête » est déjà parti). Points de fidélité crédités.
  if ((to === "READY" || to === "OUT_FOR_DELIVERY") && (await readConfig()).orders.completeWhenReady) {
    if (to === "READY" && updated.mode === "DELIVERY") return setStatus(tx, orderId, "OUT_FOR_DELIVERY", actor, "Départ en livraison automatique");
    return setStatus(tx, orderId, "COMPLETED", { userId: null, label: "Système" }, "Terminée automatiquement");
  }
  return updated;
}

export async function changeStatus(orderId: string, to: OrderStatus, actor: ActorInfo, note = "") {
  if (to === "CANCELLED" && !note.trim()) throw new OrderError("Indiquez le motif de l'annulation.");
  return db.$transaction((tx) => setStatus(tx, orderId, to, actor, note));
}

const g = globalThis as unknown as { __ysAutoComplete?: number };

/**
 * Commandes en cours dont le créneau est passé depuis `autoCompleteMinutes` : « Terminées »
 * automatiquement (points de fidélité crédités). Appelé au fil des passages (écrans, poste
 * d'impression, tâche planifiée) et au plus une fois par minute par serveur.
 */
export async function autoCompleteOrders(now = new Date()): Promise<number> {
  if (g.__ysAutoComplete && now.getTime() - g.__ysAutoComplete < 60_000) return 0;
  g.__ysAutoComplete = now.getTime();
  const minutes = (await readConfig()).orders.autoCompleteMinutes;
  if (!minutes) return 0;
  const due = await db.order.findMany({
    where: { status: { in: ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] }, source: { not: "IMPORT_WP" }, slotEnd: { lt: new Date(now.getTime() - minutes * 60_000) } },
    select: { id: true, status: true },
    take: 200,
  });
  for (const o of due) {
    await db.$transaction(async (tx) => {
      // Verrou + revérification : un employé a pu la terminer ou l'annuler entre-temps.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${o.id} FOR UPDATE`;
      const cur = await tx.order.findUniqueOrThrow({ where: { id: o.id } });
      if (!["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(cur.status)) return;
      const updated = await tx.order.update({ where: { id: o.id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.orderStatusEvent.create({ data: { orderId: o.id, from: cur.status, to: "COMPLETED", actor: "Système", note: `Terminée automatiquement (${minutes} min après le créneau)` } });
      await onLoyaltyStatus(tx, updated, "COMPLETED");
    }).catch((e) => console.error("[auto-terminer]", o.id, e));
  }
  return due.length;
}

/** Retour à l'étape précédente (erreur de manipulation en cuisine). */
export async function stepBack(orderId: string, actor: ActorInfo) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, mode: true } });
    const prev = previousStatus(o.status, o.mode);
    if (!prev) throw new OrderError("Pas d'étape précédente pour cette commande.");
    return setStatus(tx, orderId, prev, actor, "", true);
  });
}

/**
 * Note un règlement sur place (espèces, TPE, titres-restaurant).
 * Information de suivi : l'encaissement légal est fait sur la caisse certifiée du restaurant.
 */
export async function recordPayment(orderId: string, method: "CASH" | "CARD_TERMINAL" | "MEAL_VOUCHER_PAPER" | "MEAL_VOUCHER_CARD", actor: ActorInfo) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.paymentStatus !== "UNPAID") throw new OrderError("Cette commande n'est pas « à encaisser ».");
    if (o.status === "CANCELLED") throw new OrderError("Commande annulée.");
    await tx.payment.create({ data: { orderId, method, amountCents: o.totalCents, status: "SUCCEEDED", recordedById: actor.userId } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID" } });
    await audit({ userId: actor.userId, actor: actor.label, action: "order.payment", entityType: "Order", entityId: orderId,
      restaurantId: o.restaurantId, data: { method, amount: o.totalCents }, ip: actor.ip }, tx);
  });
}

async function nextCreditNumber(tx: Tx, restaurantId: string, slug: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${`credit:${restaurantId}:${year}`}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1 RETURNING "value"`;
  return `AV-${slug.slice(0, 3).toUpperCase()}-${year}-${String(rows[0]!.value).padStart(4, "0")}`;
}

/** Montant déjà remboursé / encore remboursable. */
export function refundable(order: { totalCents: number; paymentStatus: string }, refundedCents: number): number {
  if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.paymentStatus)) return 0;
  return Math.max(0, order.totalCents - refundedCents);
}

/**
 * Remboursement total ou partiel = avoir numéroté. Paiement en ligne : remboursé via Stripe.
 * Paiement sur place : l'avoir trace le remboursement fait au comptoir.
 */
export async function refundOrder(orderId: string, amountCents: number, reason: string, actor: ActorInfo) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new OrderError("Montant de remboursement invalide.");
  if (!reason.trim()) throw new OrderError("Indiquez le motif du remboursement.");

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { refunds: true, payments: { where: { status: "SUCCEEDED" } }, restaurant: { select: { slug: true } } },
  });
  const already = order.refunds.reduce((s, r) => s + r.amountCents, 0);
  const max = refundable(order, already);
  if (amountCents > max) throw new OrderError(`Remboursement maximum : ${(max / 100).toFixed(2)} €.`);

  const payment = order.payments.at(-1) ?? null;
  let stripeRefundId: string | null = null;
  if (payment?.method === "ONLINE_CARD" && payment.stripePaymentIntentId) {
    const s = await stripeFor(order.restaurantId);
    if (!s) throw new OrderError("Stripe n'est pas configuré pour ce restaurant.");
    const refund = await s.stripe.refunds.create(
      { payment_intent: payment.stripePaymentIntentId, amount: amountCents, metadata: { orderId } },
      { idempotencyKey: `refund-${orderId}-${already}-${amountCents}` },
    );
    stripeRefundId = refund.id;
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const creditNumber = await nextCreditNumber(tx, order.restaurantId, order.restaurant.slug);
    const refund = await tx.refund.create({
      data: { orderId, paymentId: payment?.id ?? null, creditNumber, amountCents, reason: reason.slice(0, 300), stripeRefundId, createdById: actor.userId },
    });
    const total = already + amountCents;
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: total >= order.totalCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    await onLoyaltyRefund(tx, order, total);
    await audit({ userId: actor.userId, actor: actor.label, action: "order.refund", entityType: "Order", entityId: orderId,
      restaurantId: order.restaurantId, data: { creditNumber, amount: amountCents, reason, stripeRefundId }, ip: actor.ip }, tx);
    return refund;
  });
}

/** Traitement d'un événement Stripe déjà vérifié (signature). Idempotent. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type !== "payment_intent.succeeded" && event.type !== "payment_intent.payment_failed" && event.type !== "payment_intent.canceled") return;
  const intent = event.data.object as Stripe.PaymentIntent;
  const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  const system: ActorInfo = { userId: null, label: "Stripe" };

  if (event.type === "payment_intent.succeeded") {
    if (payment.status === "SUCCEEDED") return;
    if (intent.amount_received !== payment.amountCents) {
      console.error(`[stripe] montant reçu ${intent.amount_received} ≠ attendu ${payment.amountCents} (${intent.id})`);
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", failureReason: "" } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "PAID" } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.status === "PENDING_PAYMENT") {
        await setStatus(tx, order.id, "NEW", system, "Paiement en ligne confirmé");
        if ((await readConfig()).orders.autoAccept) await setStatus(tx, order.id, "ACCEPTED", system, "Acceptation automatique"); // → « En préparation » si réglé
      }
      else if (order.status === "CANCELLED") {
        // Paiement arrivé après annulation automatique : signalé pour remboursement.
        await audit({ actor: "Stripe", action: "order.paid_after_cancel", entityType: "Order", entityId: order.id, restaurantId: order.restaurantId, data: { intent: intent.id } }, tx);
      }
    });
  } else {
    if (payment.status === "SUCCEEDED") return;
    const reason = intent.last_payment_error?.message ?? (event.type === "payment_intent.canceled" ? "Paiement annulé" : "Paiement refusé");
    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: event.type === "payment_intent.canceled" ? "CANCELED" : "FAILED", failureReason: reason.slice(0, 300) } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "FAILED" } });
    });
  }
}

/** Paiements en ligne abandonnés depuis plus de X minutes (Configuration) : commande annulée (créneau libéré). */
export async function cancelAbandonedPayments(): Promise<number> {
  const minutes = (await readConfig()).orders.pendingPaymentMinutes;
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", placedAt: { lt: new Date(Date.now() - minutes * 60_000) } },
    select: { id: true },
  });
  for (const o of stale) {
    await db.$transaction((tx) => setStatus(tx, o.id, "CANCELLED", { userId: null, label: "Système" }, "Paiement en ligne non finalisé"))
      .catch((e) => console.error("[orders] annulation automatique", o.id, e));
  }
  return stale.length;
}
