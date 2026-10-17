/**
 * Compte client de démonstration (site public, « Mon compte »).
 *   npm run demo:client -- [--email demo@…] [--password …]
 * Crée (ou réinitialise) le client, une adresse dans la zone de livraison et
 * deux commandes passées via le vrai parcours de commande (historique visible).
 * ⚠ Ces commandes comptent dans la comptabilité et sont inaltérables : en production,
 *   elles ne sont créées qu'avec --avec-commandes (sinon : compte et adresse seulement).
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password.ts";
import { db } from "../src/lib/db.ts";
import { placeOrder } from "../src/lib/orders/place.ts";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = (arg("email") ?? "demo@yaoma-sushi.com").toLowerCase();
  const password = arg("password") ?? randomBytes(9).toString("base64url");
  const restaurant = await db.restaurant.findFirstOrThrow({ where: { active: true }, orderBy: { sortOrder: "asc" } });

  const customer = await db.customer.upsert({
    where: { email },
    create: { email, firstName: "Client", lastName: "Démo", phone: "06 00 00 00 00", passwordHash: await hashPassword(password) },
    update: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, anonymizedAt: null },
  });
  if (!(await db.customerAddress.findFirst({ where: { customerId: customer.id } }))) {
    await db.customerAddress.create({ data: { customerId: customer.id, street: "75 place de l'Étang", postalCode: "84160", city: "Cucuron", notes: "Démo" } });
  }

  // Deux commandes de démonstration (retrait, espèces), si le client n'en a pas encore.
  const withOrders = !process.argv.includes("--sans-commandes") && (process.env.NODE_ENV !== "production" || process.argv.includes("--avec-commandes"));
  if (withOrders && (await db.order.count({ where: { customerId: customer.id } })) === 0) {
    const products = await db.product.findMany({
      where: { active: true, archived: false, isAlcohol: false, variants: { none: {} }, optionGroups: { none: {} }, priceCents: { gt: 800 } },
      take: 3,
      orderBy: { priceCents: "desc" },
    });
    const { computeSlots } = await import("../src/lib/slots.ts");
    const full = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id }, include: { openingHours: true, closures: true } });
    const slots = computeSlots({ now: new Date(), settings: full, hours: full.openingHours, closures: full.closures }).flatMap((d) => d.slots);
    for (const [i, lines] of [[products[0], products[1]], [products[2]]].entries()) {
      const slot = slots[i * 4];
      if (!slot) break;
      const r = await placeOrder({
        restaurantSlug: restaurant.slug, mode: "PICKUP", slotStart: slot.start.toISOString(),
        lines: lines.filter(Boolean).map((p) => ({ productId: p!.id, quantity: 2 })),
        customer: { firstName: "Client", lastName: "Démo", phone: "0600000000", email },
        paymentMethod: "CASH", notes: "Commande de démonstration", acceptTerms: true,
      }, { ip: "démo", customerId: customer.id });
      if (!r.ok) console.log("Commande démo refusée :", r.errors.map((e) => e.message).join(" / "));
      // Historique seulement : ne doit pas apparaître dans les commandes en cours du restaurant.
      else await db.order.update({ where: { id: r.orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
  }

  console.log(`\nCompte client de démonstration\n  Site : ${process.env.APP_URL ?? "http://localhost:3000"}/compte\n  E-mail : ${email}\n  Mot de passe : ${password}\n`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
