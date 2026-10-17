import { db, type Tx } from "./db";

/**
 * File de tâches en base (« outbox ») : e-mails, webhooks sortants, impressions PrintNode.
 * Une tâche créée dans la même transaction que la commande n'est jamais perdue,
 * et elle est relancée avec un délai croissant en cas d'échec.
 */

export type JobType = "email" | "webhook" | "printnode" | "bizprint";

export async function enqueue(type: JobType, payload: object, tx?: Tx, runAt?: Date): Promise<void> {
  await (tx ?? db).outboxJob.create({ data: { type, payload, runAt: runAt ?? new Date() } });
  if (!runAt || runAt <= new Date()) drainAfterResponse();
}

/**
 * Serverless (Vercel) : traite la file juste après l'envoi de la réponse (la transaction
 * de la commande est alors validée). Sur un serveur classique, le worker s'en charge.
 */
function drainAfterResponse() {
  if (!process.env.VERCEL && process.env.SERVERLESS !== "1") return;
  import("next/server")
    .then(({ after }) => after(async () => {
      const { drainJobs } = await import("./worker");
      await drainJobs().catch((e) => console.error("[jobs] traitement après réponse", e));
    }))
    .catch(() => { /* hors requête : la tâche planifiée la traitera */ });
}

export type JobHandler = (payload: unknown) => Promise<void>;

const MAX_ATTEMPTS = 8;

/** Délai avant nouvelle tentative : 30 s, 1 min, 2 min, 4 min… (max 6 h). */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 6 * 3600_000);
}

/** Prend et traite un lot de tâches. Renvoie le nombre traité. */
export async function runJobs(handlers: Record<JobType, JobHandler>, batch = 20): Promise<number> {
  // Réservation atomique (SKIP LOCKED : plusieurs workers possibles).
  const jobs = await db.$queryRaw<{ id: string; type: JobType; payload: unknown; attempts: number }[]>`
    UPDATE "OutboxJob" SET "lockedAt" = now()
    WHERE id IN (
      SELECT id FROM "OutboxJob"
      WHERE "doneAt" IS NULL AND "runAt" <= now() AND "attempts" < ${MAX_ATTEMPTS}
        AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '5 minutes')
      ORDER BY "runAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED
    ) RETURNING id, type, payload, attempts`;

  for (const job of jobs) {
    try {
      await handlers[job.type](job.payload);
      await db.outboxJob.update({ where: { id: job.id }, data: { doneAt: new Date(), lockedAt: null, attempts: job.attempts + 1 } });
    } catch (e) {
      const attempts = job.attempts + 1;
      await db.outboxJob.update({
        where: { id: job.id },
        data: {
          attempts,
          lockedAt: null,
          lastError: String((e as Error).message ?? e).slice(0, 1000),
          runAt: new Date(Date.now() + retryDelayMs(attempts)),
        },
      });
      console.error(`[jobs] ${job.type} ${job.id} échec (${attempts}/${MAX_ATTEMPTS}) :`, (e as Error).message);
    }
  }
  return jobs.length;
}
