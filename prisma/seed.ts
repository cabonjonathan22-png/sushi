/**
 * Création d'un compte du back-office.
 *
 *   npm run db:seed -- --email patron@exemple.fr --name "Le patron" --role OWNER
 *   npm run db:seed                       # super-admin (ADMIN_EMAIL) si aucun compte n'existe
 *   SEED_PASSWORD=… npm run db:seed -- …    # mot de passe imposé (ex. même compte en local et en production)
 *
 * Le mot de passe provisoire est affiché UNE fois ; la double authentification
 * sera demandée à la première connexion (super-admin / propriétaire).
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password.ts";
import { db } from "../src/lib/db.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const role = (arg("role") ?? "SUPER_ADMIN") as "SUPER_ADMIN" | "OWNER" | "MANAGER" | "EMPLOYEE";
  const name = arg("name") ?? (role === "SUPER_ADMIN" ? "Développeur" : email);
  if (!email) throw new Error("Indiquez --email (ou ADMIN_EMAIL dans .env)");

  if (!arg("email") && (await db.user.count()) > 0) {
    console.log("Des comptes existent déjà : rien à faire (utilisez --email pour en créer un autre).");
    return;
  }
  if (await db.user.findUnique({ where: { email } })) {
    console.log(`Le compte ${email} existe déjà.`);
    return;
  }
  // Mot de passe imposé (même compte sur plusieurs bases) via SEED_PASSWORD, sinon tiré au hasard.
  const password = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url");
  if (password.length < 10) throw new Error("SEED_PASSWORD : 10 caractères minimum.");
  const user = await db.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
  if (role === "MANAGER" || role === "EMPLOYEE") {
    const restaurants = await db.restaurant.findMany({ select: { id: true } });
    await db.userRestaurant.createMany({ data: restaurants.map((r) => ({ userId: user.id, restaurantId: r.id })) });
  }
  console.log(`\nCompte créé : ${email} (${role})\nMot de passe provisoire : ${password}\nÀ changer après la première connexion (/admin/securite).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
