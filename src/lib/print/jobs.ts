import { db } from "../db";
import { loadOrder, type FullOrder } from "../orders/load";

/**
 * File des tickets pour les imprimantes qui interrogent le serveur
 * (Star CloudPRNT, Epson Server Direct Print, agent local).
 * Un ticket « envoyé » mais jamais confirmé est renvoyé après 2 minutes (5 essais max).
 */

const RESEND_AFTER_MS = 2 * 60_000;
const MAX_ATTEMPTS = 5;

export async function printerByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const p = await db.printer.findUnique({ where: { deviceToken: token } });
  if (!p || !p.active) return null;
  await db.printer.update({ where: { id: p.id }, data: { lastSeenAt: new Date() } });
  return p;
}

/** Prochain ticket à imprimer (sans le réserver). */
export function peekJob(printerId: string) {
  return db.printJob.findFirst({
    where: {
      printerId,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: "PENDING" }, { status: "SENT", sentAt: { lt: new Date(Date.now() - RESEND_AFTER_MS) } }],
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Réserve un ticket précis (ou le prochain) et renvoie la commande à imprimer. */
export async function claimJob(printerId: string, jobId?: string): Promise<{ jobId: string; copies: number; order: FullOrder } | null> {
  const job = jobId ? await db.printJob.findFirst({ where: { id: jobId, printerId, status: { in: ["PENDING", "SENT"] } } }) : await peekJob(printerId);
  if (!job) return null;
  const attempts = job.attempts + 1;
  await db.printJob.update({
    where: { id: job.id },
    data: { status: attempts >= MAX_ATTEMPTS ? "FAILED" : "SENT", sentAt: new Date(), attempts, ...(attempts >= MAX_ATTEMPTS ? { lastError: "Pas de confirmation de l'imprimante" } : {}) },
  });
  const order = await loadOrder(job.orderId);
  if (!order) return null;
  return { jobId: job.id, copies: job.copies, order };
}

export async function completeJob(printerId: string, jobId: string, ok: boolean, error = "") {
  await db.printJob.updateMany({
    where: { id: jobId, printerId },
    data: ok ? { status: "DONE", doneAt: new Date(), lastError: "" } : { status: "PENDING", lastError: error.slice(0, 300) },
  });
}
