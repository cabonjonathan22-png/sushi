"use server";

import { revalidatePath } from "next/cache";
import { actorOf, authorize } from "@/lib/admin";
import { clientIp } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { changeStatus, OrderError, recordPayment, refundOrder } from "@/lib/orders/manage";
import { queueReprint } from "@/lib/orders/notify";
import type { OrderStatus } from "@/lib/order-status";
import { parseEuros } from "@/lib/money";

type Result = { ok?: string; error?: string } | undefined;

async function orderRestaurant(orderId: string): Promise<string> {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { restaurantId: true } });
  if (!o) throw new OrderError("Commande introuvable.");
  return o.restaurantId;
}

const STATUSES: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];

/** Changement de statut (bouton de l'écran commandes / cuisine / fiche). */
export async function setOrderStatus(orderId: string, to: OrderStatus, note = ""): Promise<Result> {
  try {
    if (!STATUSES.includes(to)) throw new OrderError("Statut inconnu.");
    const staff = await authorize("orders.update", await orderRestaurant(orderId));
    await changeStatus(orderId, to, actorOf(staff, await clientIp()), note);
    revalidatePath(`/admin/commandes/${orderId}`);
    return { ok: "Statut mis à jour." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur." };
  }
}

export async function markPaid(orderId: string, method: "CASH" | "CARD_TERMINAL" | "MEAL_VOUCHER_PAPER" | "MEAL_VOUCHER_CARD"): Promise<Result> {
  try {
    if (!["CASH", "CARD_TERMINAL", "MEAL_VOUCHER_PAPER", "MEAL_VOUCHER_CARD"].includes(method)) throw new OrderError("Moyen inconnu.");
    const staff = await authorize("orders.payment", await orderRestaurant(orderId));
    await recordPayment(orderId, method, actorOf(staff, await clientIp()));
    revalidatePath(`/admin/commandes/${orderId}`);
    return { ok: "Règlement noté." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur." };
  }
}

export async function reprint(orderId: string): Promise<Result> {
  try {
    await authorize("orders.print", await orderRestaurant(orderId));
    const n = await queueReprint(orderId);
    return { ok: n ? `Envoyé à ${n} imprimante(s).` : "Aucune imprimante réseau : utilisez « Imprimer » (navigateur)." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur." };
  }
}

/** Formulaire de remboursement (fiche commande). */
export async function refundAction(_: Result, form: FormData): Promise<Result> {
  const orderId = String(form.get("orderId") ?? "");
  try {
    const staff = await authorize("orders.refund", await orderRestaurant(orderId));
    const cents = parseEuros(String(form.get("amount") ?? ""));
    if (cents === null) throw new OrderError("Montant invalide (ex. 12,50).");
    const r = await refundOrder(orderId, cents, String(form.get("reason") ?? ""), actorOf(staff, await clientIp()));
    revalidatePath(`/admin/commandes/${orderId}`);
    return { ok: `Remboursement enregistré — avoir ${r.creditNumber}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur." };
  }
}

export async function cancelAction(_: Result, form: FormData): Promise<Result> {
  return setOrderStatus(String(form.get("orderId") ?? ""), "CANCELLED", String(form.get("reason") ?? ""));
}
