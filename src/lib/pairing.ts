import "server-only";
import { randomInt } from "node:crypto";
import { hashPassword } from "./auth/password";
import { randomToken, sha256 } from "./crypto";
import { db } from "./db";

/**
 * Codes d'installation à 6 chiffres, créés dans le back-office et saisis sur l'appareil
 * du restaurant (page /installer) : la tablette se connecte sans mot de passe, l'ordinateur
 * télécharge son poste d'impression. Valables 30 minutes ; la tablette consomme le code.
 */
export type PairingPurpose = "TABLET" | "PRINTER";
const TTL_MS = 30 * 60_000;

export async function createPairingCode(purpose: PairingPurpose, restaurantId: string, createdById: string, printerId?: string): Promise<string> {
  // Les anciens codes encore valables pour le même appareil sont annulés.
  await db.pairingCode.updateMany({ where: { purpose, restaurantId, printerId: printerId ?? null, usedAt: null }, data: { expiresAt: new Date() } });
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const exists = await db.pairingCode.findUnique({ where: { codeHash: sha256(code) } });
    if (exists && exists.expiresAt > new Date()) continue;
    if (exists) await db.pairingCode.delete({ where: { id: exists.id } });
    await db.pairingCode.create({ data: { codeHash: sha256(code), purpose, restaurantId, printerId, createdById, expiresAt: new Date(Date.now() + TTL_MS) } });
    return code;
  }
}

export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Code valable (non expiré, non utilisé) ou null. */
export async function findPairingCode(raw: string) {
  const code = raw.replace(/\D/g, "");
  if (code.length !== 6) return null;
  const p = await db.pairingCode.findUnique({ where: { codeHash: sha256(code) } });
  if (!p || p.usedAt || p.expiresAt < new Date()) return null;
  return p;
}

/** Compte « appareil » de la tablette : employé du restaurant, sans mot de passe utilisable. */
export async function createTabletUser(restaurantId: string, pairingId: string) {
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, slug: true } });
  const count = await db.user.count({ where: { device: true, restaurants: { some: { restaurantId } } } });
  return db.$transaction(async (tx) => {
    await tx.pairingCode.update({ where: { id: pairingId }, data: { usedAt: new Date() } });
    return tx.user.create({
      data: {
        email: `tablette-${r.slug}-${randomToken(6).toLowerCase()}@appareil.invalid`,
        name: `Tablette ${count + 1} – ${r.name}`,
        passwordHash: await hashPassword(randomToken(32)),
        role: "EMPLOYEE",
        device: true,
        restaurants: { create: [{ restaurantId }] },
      },
    });
  });
}
