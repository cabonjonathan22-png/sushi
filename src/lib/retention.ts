import { db } from "./db";

/**
 * RGPD : anonymise les comptes clients sans commande depuis 3 ans (et créés depuis plus de 3 ans).
 * Les commandes sont conservées (comptabilité) mais détachées du compte.
 */
export async function anonymizeInactiveCustomers(now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - 3 * 365 * 24 * 3600_000);
  const stale = await db.customer.findMany({
    where: { anonymizedAt: null, createdAt: { lt: limit }, orders: { none: { placedAt: { gte: limit } } } },
    select: { id: true },
    take: 500,
  });
  for (const { id } of stale) {
    await db.$transaction([
      db.order.updateMany({ where: { customerId: id }, data: { customerId: null } }),
      db.customerAddress.deleteMany({ where: { customerId: id } }),
      db.session.deleteMany({ where: { customerId: id } }),
      db.customer.update({ where: { id }, data: { email: `supprime-${id}@anonyme.invalid`, phone: "", firstName: "", lastName: "", passwordHash: "", anonymizedAt: now } }),
    ]);
  }
  return stale.length;
}
