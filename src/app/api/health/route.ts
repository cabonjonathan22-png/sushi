import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Surveillance (UptimeRobot, Docker, Vercel) : 200 si l'application et la base répondent.
 * En cas de problème, indique la cause (sans jamais exposer de valeur secrète) :
 * base absente, injoignable, non migrée ou vide, variables manquantes.
 */
export async function GET() {
  const config = {
    appUrl: !!process.env.APP_URL,
    encryptionKey: !!process.env.APP_ENCRYPTION_KEY,
  };
  const fail = (database: string) => Response.json({ ok: false, database, config }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!process.env.DATABASE_URL) return fail("non configurée (DATABASE_URL absente)");
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return fail("injoignable (adresse ou mot de passe incorrect, base arrêtée ?)");
  }
  try {
    const [restaurants, pending] = await Promise.all([
      db.restaurant.count(),
      db.outboxJob.count({ where: { doneAt: null, attempts: { gte: 3 } } }),
    ]);
    if (!restaurants) return fail("vide (aucun restaurant : copier les données, voir docs/deploiement-vercel.md)");
    return Response.json({ ok: true, failingJobs: pending, config }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("non initialisée (tables absentes : migrations non appliquées)");
  }
}
