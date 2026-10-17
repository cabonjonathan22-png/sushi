import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/http";
import { maintenance } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tâche planifiée (Vercel Cron, ou tout planificateur externe) : file de tâches en
 * retard, paiements abandonnés, statuts BizPrint, purges RGPD.
 * Protégée par l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) return json({ ok: false }, 401);
  await maintenance();
  return json({ ok: true });
}
