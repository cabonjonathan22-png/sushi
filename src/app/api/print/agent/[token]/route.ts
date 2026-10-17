import { json, readJson } from "@/lib/http";
import { renderEscPos } from "@/lib/print/escpos";
import { claimJob, completeJob, printerByToken } from "@/lib/print/jobs";
import { buildTicket, COLUMNS } from "@/lib/print/ticket";

/**
 * Agent d'impression local (agent/print-agent.mjs) : interroge le serveur et envoie
 * le ticket en ESC/POS à une imprimante thermique réseau (port 9100).
 *  - GET  : prochain ticket { job: { id, data (base64) } } ou { job: null }
 *  - POST : confirmation { jobId, ok, error? }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return json({ error: "Inconnu" }, 404);
  const claimed = await claimJob(printer.id);
  if (!claimed) return json({ job: null });
  const cols = COLUMNS[printer.paperWidth];
  const labels = claimed.copies > 1 ? ["CUISINE", claimed.order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, claimed.copies) : [undefined];
  const data = Buffer.concat(labels.map((l) => renderEscPos(buildTicket(claimed.order, l), cols))).toString("base64");
  return json({ job: { id: claimed.jobId, reference: claimed.order.reference, data } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return json({ error: "Inconnu" }, 404);
  const body = (await readJson(req).catch(() => null)) as { jobId?: string; ok?: boolean; error?: string } | null;
  if (!body?.jobId) return json({ error: "jobId manquant" }, 400);
  await completeJob(printer.id, body.jobId, !!body.ok, body.error ?? "");
  return json({ ok: true });
}
