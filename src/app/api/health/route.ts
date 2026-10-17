import { db } from "@/lib/db";

/** Surveillance (UptimeRobot, Docker) : 200 si l'application et la base répondent. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const pending = await db.outboxJob.count({ where: { doneAt: null, attempts: { gte: 3 } } });
    return Response.json({ ok: true, failingJobs: pending }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
