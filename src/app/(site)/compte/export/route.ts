import { getCustomer } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Export RGPD : toutes les données du client connecté, en JSON. */
export async function GET() {
  const c = await getCustomer();
  if (!c) return new Response("Non connecté", { status: 401 });
  const orders = await db.order.findMany({
    where: { customerId: c.id },
    orderBy: { placedAt: "asc" },
    include: { lines: { select: { name: true, variantLabel: true, options: true, quantity: true, unitPriceCents: true, totalCents: true } } },
  });
  const data = {
    exportedAt: new Date().toISOString(),
    account: { email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone, createdAt: c.createdAt },
    addresses: c.addresses.map(({ street, extra, postalCode, city, notes }) => ({ street, extra, postalCode, city, notes })),
    orders: orders.map((o) => ({
      reference: o.reference, placedAt: o.placedAt, mode: o.mode, slot: o.slotStart, status: o.status, total: o.totalCents / 100,
      paymentMethod: o.paymentMethod, name: o.customerName, phone: o.customerPhone, email: o.customerEmail,
      address: o.mode === "DELIVERY" ? `${o.addressStreet} ${o.addressExtra} ${o.postalCode} ${o.city}`.trim() : null,
      notes: o.notes, items: o.lines,
    })),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mes-donnees.json"', "Cache-Control": "no-store" },
  });
}
