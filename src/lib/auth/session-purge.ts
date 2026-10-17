import { db } from "../db";

/** Purge des sessions expirées (worker) — séparé de session.ts, qui dépend de next/headers. */
export async function purgeSessions() {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
