import { db } from "../db";
import { ACTIVE_STATUSES } from "../order-status";
import type { OrderLineOption } from "./load";

/** Commandes affichées sur l'écran « en cours » et en cuisine (forme compacte, sérialisable). */
export async function boardOrders(restaurantId: string, opts: { includeDoneMinutes?: number } = {}) {
  const since = new Date(Date.now() - (opts.includeDoneMinutes ?? 0) * 60_000);
  const orders = await db.order.findMany({
    where: {
      restaurantId,
      OR: [
        { status: { in: ACTIVE_STATUSES } },
        ...(opts.includeDoneMinutes ? [{ status: { in: ["COMPLETED" as const, "CANCELLED" as const] }, updatedAt: { gte: since } }] : []),
      ],
    },
    orderBy: { slotStart: "asc" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    take: 200,
  });
  return orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    dailyNumber: o.dailyNumber,
    status: o.status,
    mode: o.mode,
    slotStart: o.slotStart.toISOString(),
    placedAt: o.placedAt.toISOString(),
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: o.mode === "DELIVERY" ? `${o.addressStreet}${o.addressExtra ? `, ${o.addressExtra}` : ""}, ${o.postalCode} ${o.city}` : "",
    deliveryNotes: o.deliveryNotes,
    notes: o.notes,
    totalCents: o.totalCents,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    hasAlcohol: o.lines.some((l) => l.isAlcohol),
    lines: o.lines.map((l) => ({
      qty: l.quantity,
      name: l.name,
      detail: [l.variantLabel, ...(l.options as unknown as OrderLineOption[]).map((x) => x.name)].filter(Boolean).join(" · "),
      category: l.categoryName,
    })),
  }));
}

export type BoardOrder = Awaited<ReturnType<typeof boardOrders>>[number];
