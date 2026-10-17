import { db, type Tx } from "../db";
import { enqueue } from "../jobs";
import { readConfig } from "../config";
import type { OrderStatus } from "../order-status";

/**
 * Effets d'une commande confirmée (payée en ligne ou à régler sur place) :
 * e-mails client + restaurant, webhooks sortants, tickets pour les imprimantes
 * qui interrogent le serveur. Tout est mis en file dans la transaction appelante.
 */
export async function onOrderConfirmed(tx: Tx, order: { id: string; restaurantId: string; customerEmail: string }) {
  const restaurant = await tx.restaurant.findUniqueOrThrow({
    where: { id: order.restaurantId },
    select: { alertEmails: true, email: true, printers: { where: { active: true, autoPrint: true } }, webhooks: { where: { active: true } } },
  });

  if (order.customerEmail) await enqueue("email", { kind: "customerConfirmation", orderId: order.id }, tx);
  const alerts = restaurant.alertEmails.length ? restaurant.alertEmails : restaurant.email ? [restaurant.email] : [];
  if (alerts.length) await enqueue("email", { kind: "restaurantNewOrder", orderId: order.id, to: alerts }, tx);

  for (const w of restaurant.webhooks.filter((x) => x.events.includes("order.created"))) {
    await enqueue("webhook", { endpointId: w.id, event: "order.created", orderId: order.id, at: new Date().toISOString() }, tx);
  }

  // Imprimantes « serveur » : un travail par imprimante. L'impression navigateur
  // est déclenchée par l'écran des commandes ouvert (pas de travail en base).
  for (const p of restaurant.printers.filter((x) => x.method !== "BROWSER")) {
    const job = await tx.printJob.create({ data: { orderId: order.id, printerId: p.id, copies: p.copies } });
    if (p.method === "PRINTNODE") await enqueue("printnode", { printJobId: job.id }, tx);
    if (p.method === "BIZPRINT") await enqueue("bizprint", { printJobId: job.id }, tx);
  }
}

export async function onStatusChanged(
  tx: Tx,
  order: { id: string; restaurantId: string; customerEmail: string },
  to: OrderStatus,
) {
  const notify = (await readConfig()).orders.notifyStatuses as OrderStatus[];
  if (order.customerEmail && notify.includes(to)) {
    await enqueue("email", { kind: "customerStatus", orderId: order.id }, tx);
  }
  const hooks = await tx.webhookEndpoint.findMany({ where: { restaurantId: order.restaurantId, active: true } });
  for (const w of hooks.filter((x) => x.events.includes("order.status_changed"))) {
    await enqueue("webhook", { endpointId: w.id, event: "order.status_changed", orderId: order.id, status: to, at: new Date().toISOString() }, tx);
  }
}

/** Réimpression manuelle sur toutes les imprimantes serveur du restaurant. */
export async function queueReprint(orderId: string, printerId?: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { restaurantId: true } });
  const printers = await db.printer.findMany({
    where: { restaurantId: order.restaurantId, active: true, method: { not: "BROWSER" }, ...(printerId ? { id: printerId } : {}) },
  });
  for (const p of printers) {
    const job = await db.printJob.create({ data: { orderId, printerId: p.id, copies: p.copies } });
    if (p.method === "PRINTNODE") await enqueue("printnode", { printJobId: job.id });
    if (p.method === "BIZPRINT") await enqueue("bizprint", { printJobId: job.id });
  }
  return printers.length;
}
