import { db } from "./db";

/**
 * Limitation de débit à fenêtre fixe, stockée en base (fonctionne avec plusieurs instances).
 * Renvoie true si l'action est autorisée.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

/** Limites par défaut. */
export const LIMITS = {
  login: { limit: 10, window: 15 * 60 }, // par IP
  checkout: { limit: 20, window: 10 * 60 }, // par IP
  api: { limit: 300, window: 60 }, // par clé API
  publicForm: { limit: 30, window: 60 },
} as const;

/** Purge des compteurs expirés (appelée par le worker). */
export async function purgeRateLimits(): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`;
}
