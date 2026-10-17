import { db } from "../db";
import { loadOrder } from "../orders/load";
import { renderEscPos } from "./escpos";
import { buildTicket, COLUMNS } from "./ticket";

/**
 * PrintNode (printnode.com) : un petit client installé sur le PC du restaurant
 * expose les imprimantes USB / réseau ; on lui envoie le ticket en ESC/POS brut.
 * Clé API PrintNode : variable PRINTNODE_API_KEY ; id d'imprimante : réglage de l'imprimante.
 */
export async function submitPrintNode(payload: { printJobId: string }) {
  const job = await db.printJob.findUnique({ where: { id: payload.printJobId }, include: { printer: true } });
  if (!job?.printer || job.status === "DONE") return;
  const key = process.env.PRINTNODE_API_KEY;
  if (!key) throw new Error("PRINTNODE_API_KEY manquant");
  const order = await loadOrder(job.orderId);
  if (!order) return;
  const cols = COLUMNS[job.printer.paperWidth];
  const content = renderEscPos(buildTicket(order), cols, job.copies).toString("base64");
  const res = await fetch("https://api.printnode.com/printjobs", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ printerId: Number(job.printer.remotePrinterId), title: `Commande ${order.reference}`, contentType: "raw_base64", content, source: "Yaoma" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    await db.printJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: `HTTP ${res.status}` } });
    throw new Error(`PrintNode HTTP ${res.status}`);
  }
  await db.printJob.update({ where: { id: job.id }, data: { status: "DONE", sentAt: new Date(), doneAt: new Date(), attempts: { increment: 1 } } });
}
