import { createHash } from "node:crypto";
import { db, type Tx } from "./db";

/**
 * Journal des actions, chaîné : chaque entrée contient l'empreinte de la précédente.
 * Toute modification ou suppression (de toute façon interdite par un trigger SQL)
 * serait détectée par `verifyAuditChain`.
 */

export interface AuditEntry {
  userId?: string | null;
  actor: string; // nom lisible : « Marie (gérante) », « Client », « API: Uber », « Système »
  action: string; // ex. « order.status », « product.update »
  entityType: string;
  entityId?: string;
  restaurantId?: string | null;
  data?: Record<string, unknown>;
  ip?: string;
}

const GENESIS = "0".repeat(64);

/** JSON canonique (clés triées) : PostgreSQL (jsonb) ne conserve pas l'ordre des clés. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function entryHash(prev: string, at: Date, e: AuditEntry): string {
  // Aller-retour JSON : ce qui est haché est exactement ce qui sera relu en base.
  const data = JSON.parse(JSON.stringify(e.data ?? {})) as unknown;
  const payload = canonicalJson([prev, at.toISOString(), e.userId ?? null, e.actor, e.action, e.entityType, e.entityId ?? "", e.restaurantId ?? null, data]);
  return createHash("sha256").update(payload).digest("hex");
}

async function write(tx: Tx, e: AuditEntry) {
  // Verrou transactionnel : les entrées sont chaînées une par une.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7426001)`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const previousHash = last?.hash ?? GENESIS;
  const at = new Date();
  await tx.auditLog.create({
    data: {
      at,
      userId: e.userId ?? null,
      actor: e.actor,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? "",
      restaurantId: e.restaurantId ?? null,
      data: (e.data ?? {}) as object,
      ip: e.ip ?? "",
      previousHash,
      hash: entryHash(previousHash, at, e),
    },
  });
}

/** Ajoute une entrée (dans la transaction fournie, ou dans une nouvelle). */
export async function audit(e: AuditEntry, tx?: Tx): Promise<void> {
  if (tx) return write(tx, e);
  await db.$transaction((t) => write(t, e));
}

/** Vérifie l'intégrité de toute la chaîne. Renvoie le n° de la première entrée invalide ou null. */
export async function verifyAuditChain(): Promise<number | null> {
  let prev = GENESIS;
  let cursor = 0;
  for (;;) {
    const batch = await db.auditLog.findMany({ where: { seq: { gt: cursor } }, orderBy: { seq: "asc" }, take: 1000 });
    if (!batch.length) return null;
    for (const r of batch) {
      const e: AuditEntry = {
        userId: r.userId, actor: r.actor, action: r.action, entityType: r.entityType,
        entityId: r.entityId, restaurantId: r.restaurantId, data: r.data as Record<string, unknown>,
      };
      if (r.previousHash !== prev || r.hash !== entryHash(prev, r.at, e)) return r.seq;
      prev = r.hash;
      cursor = r.seq;
    }
  }
}
