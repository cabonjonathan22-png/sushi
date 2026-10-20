import net from "node:net";
import { db } from "../db";
import { loadOrder } from "../orders/load";
import { renderEscPos } from "./escpos";
import { orderEscPos, parseAddress } from "./jobs";
import { COLUMNS, testTicket } from "./ticket";

/**
 * Impression directe : le serveur (Vercel) ouvre une connexion vers l'imprimante
 * (ESC/POS brut, port 9100) à l'adresse publique de la box du restaurant, qui la
 * redirige vers l'imprimante (« redirection de port »). Aucun appareil au restaurant.
 */
export function sendRaw(address: string, data: Buffer, timeoutMs = 8000): Promise<void> {
  const target = parseAddress(address);
  if (!target) return Promise.reject(new Error("Adresse de l'imprimante invalide"));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ ...target, timeout: timeoutMs }, () => socket.end(data, () => resolve()));
    socket.on("timeout", () => { socket.destroy(); reject(new Error("Imprimante injoignable (délai dépassé) : vérifiez la box et l'adresse")); });
    socket.on("error", (e: NodeJS.ErrnoException) => reject(new Error(e.code === "ECONNREFUSED" ? "Connexion refusée : la redirection de port de la box n'est pas active" : e.message)));
  });
}

export async function submitDirect(payload: { printJobId: string }) {
  const job = await db.printJob.findUnique({ where: { id: payload.printJobId }, include: { printer: true } });
  if (!job?.printer || job.status === "DONE") return;
  const order = await loadOrder(job.orderId);
  if (!order) return;
  try {
    await sendRaw(job.printer.address, orderEscPos(order, job.printer.paperWidth, job.copies));
  } catch (e) {
    await db.printJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: (e as Error).message.slice(0, 300) } });
    throw e; // la file réessaie plus tard
  }
  await db.printJob.update({ where: { id: job.id }, data: { status: "DONE", sentAt: new Date(), doneAt: new Date(), attempts: { increment: 1 }, lastError: "" } });
  await db.printer.update({ where: { id: job.printer.id }, data: { lastSeenAt: new Date() } });
}

/** Ticket d'essai envoyé tout de suite (bouton du back-office). */
export async function testDirect(printerId: string) {
  const p = await db.printer.findUniqueOrThrow({ where: { id: printerId }, include: { restaurant: { select: { name: true } } } });
  await sendRaw(p.address, renderEscPos(testTicket(p.restaurant.name, p.name, p.address), COLUMNS[p.paperWidth]));
  await db.printer.update({ where: { id: p.id }, data: { lastSeenAt: new Date() } });
}
