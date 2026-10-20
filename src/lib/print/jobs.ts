import { db } from "../db";
import { loadOrder, type FullOrder } from "../orders/load";
import { renderEscPos } from "./escpos";
import { buildTicket, COLUMNS } from "./ticket";
import { localDate, localHHMM, localWeekday, minutesOf } from "../time";

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
  // « Vu à » : écrit au plus une fois par minute (le poste interroge toutes les quelques secondes).
  if (!p.lastSeenAt || p.lastSeenAt < new Date(Date.now() - 60_000)) await db.printer.update({ where: { id: p.id }, data: { lastSeenAt: new Date() } });
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

/** Ticket ESC/POS d'une commande : un exemplaire par destinataire (cuisine, livreur / comptoir, client). */
export function orderEscPos(order: FullOrder, paperWidth: keyof typeof COLUMNS, copies: number): Buffer {
  const labels = copies > 1 ? ["CUISINE", order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, copies) : [undefined];
  return Buffer.concat(labels.map((l) => renderEscPos(buildTicket(order, l), COLUMNS[paperWidth])));
}

/** « 192.168.1.87 » ou « 192.168.1.87:9100 » ou « box.example.fr:9101 » → hôte + port (9100 par défaut). */
export function parseAddress(address: string): { host: string; port: number } | null {
  const m = address.trim().match(/^([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?$/);
  if (!m) return null;
  const port = Number(m[2] ?? 9100);
  return port > 0 && port < 65536 ? { host: m[1]!, port } : null;
}

/**
 * Rythme d'interrogation du poste d'impression : quelques secondes pendant le service
 * (une heure avant l'ouverture jusqu'à une heure après la fermeture), 15 minutes sinon,
 * pour laisser la base de données se mettre en veille la nuit (offres gratuites).
 */
export async function agentPollSeconds(p: { restaurantId: string; address: string; agentInfo: unknown; testRequestedAt: Date | null; scanRequestedAt: Date | null }, now = new Date()): Promise<number> {
  const recent = (d: Date | null) => !!d && d > new Date(now.getTime() - 15 * 60_000);
  // Installation / réglage à distance en cours : le poste reste réactif 15 minutes.
  const info = (p.agentInfo ?? {}) as { discovered?: unknown; scannedAt?: string; downloadedAt?: string; lastTest?: { at?: string } };
  const at = (v?: string) => (v ? new Date(v) : null);
  if (!p.address || !info.discovered || [p.testRequestedAt, p.scanRequestedAt, at(info.scannedAt), at(info.downloadedAt), at(info.lastTest?.at)].some(recent)) return 3;
  const r = await db.restaurant.findUnique({ where: { id: p.restaurantId }, select: { timezone: true, openingHours: true } });
  if (!r?.openingHours.length) return 5;
  const day = localDate(now, r.timezone);
  const wd = localWeekday(day);
  const m = minutesOf(localHHMM(now, r.timezone));
  const open = r.openingHours.some((h) => h.weekday === wd && m >= minutesOf(h.opens) - 60 && m <= minutesOf(h.closes) + 60);
  return open ? 4 : 900;
}
