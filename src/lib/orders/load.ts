import { db } from "../db";

/** Commande complète (lignes, paiements, avoirs, historique, restaurant). */
export function loadOrder(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      statusEvents: { orderBy: { at: "asc" } },
      restaurant: { select: { id: true, slug: true, name: true, street: true, postalCode: true, city: true, phones: true, alertEmails: true, email: true } },
    },
  });
}

export type FullOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

export interface OrderLineOption {
  id?: string;
  group: string;
  name: string;
  priceDeltaCents: number;
}

/** Représentation publique (API REST, webhooks) — contenu complet, sans données internes. */
export function orderToApi(o: FullOrder) {
  return {
    id: o.id,
    reference: o.reference,
    number: o.number,
    dailyNumber: o.dailyNumber,
    restaurant: { id: o.restaurant.id, slug: o.restaurant.slug, name: o.restaurant.name },
    status: o.status,
    mode: o.mode,
    period: o.period,
    slot: { start: o.slotStart.toISOString(), end: o.slotEnd.toISOString() },
    customer: { name: o.customerName, phone: o.customerPhone, email: o.customerEmail },
    address: o.mode === "DELIVERY"
      ? { street: o.addressStreet, extra: o.addressExtra, postalCode: o.postalCode, city: o.city, notes: o.deliveryNotes, zone: o.zoneName }
      : null,
    notes: o.notes,
    items: o.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      name: l.name,
      variant: l.variantLabel || null,
      options: l.options as unknown as OrderLineOption[],
      quantity: l.quantity,
      unitPrice: l.unitPriceCents,
      total: l.totalCents,
      vatRate: l.vatRate / 100,
    })),
    totals: {
      currency: "EUR",
      subtotal: o.subtotalCents,
      discount: o.discountCents,
      extrasDiscount: o.extrasDiscountCents,
      deliveryFee: o.deliveryFeeCents,
      total: o.totalCents,
      vat: o.vatBreakdown,
    },
    payment: {
      method: o.paymentMethod,
      status: o.paymentStatus,
      paid: o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED",
    },
    promoCode: o.promoCode || null,
    placedAt: o.placedAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
