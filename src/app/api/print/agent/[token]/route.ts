import { db } from "@/lib/db";
import { json, readJson } from "@/lib/http";
import { renderEscPos } from "@/lib/print/escpos";
import { agentPollSeconds, claimJob, completeJob, orderEscPos, printerByToken } from "@/lib/print/jobs";
import { COLUMNS, testTicket } from "@/lib/print/ticket";

/**
 * Poste d'impression du restaurant (agent Windows installé par code, ou agent/print-agent.mjs) :
 * il interroge le site toutes les 3 secondes et envoie les tickets en ESC/POS à l'imprimante
 * réseau (port 9100). Le site reste sur Vercel : c'est le poste qui vient chercher les tickets.
 *  - GET  : { job: { id, reference, data (base64) } | null, config: { address, scan, wait (secondes avant la prochaine visite) } }
 *  - POST : confirmation { jobId, ok, error? } ou rapport { report: { host, version, discovered[] } }
 */
const TEST_JOB = "test";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return json({ error: "Inconnu" }, 404);
  const info = (printer.agentInfo ?? {}) as { discovered?: unknown[] };
  // Première connexion du poste (aucun rapport) : il cherche tout de suite les imprimantes du réseau.
  const config = { address: printer.address, scan: !!printer.scanRequestedAt || !info.discovered, wait: await agentPollSeconds(printer) };

  // Ticket d'essai demandé depuis le back-office.
  if (printer.testRequestedAt && printer.testRequestedAt > new Date(Date.now() - 10 * 60_000)) {
    const r = await db.restaurant.findUniqueOrThrow({ where: { id: printer.restaurantId }, select: { name: true } });
    const data = renderEscPos(testTicket(r.name, printer.name, printer.address), COLUMNS[printer.paperWidth]).toString("base64");
    return json({ job: { id: TEST_JOB, reference: "TEST", data }, config });
  }

  const claimed = await claimJob(printer.id);
  if (!claimed) return json({ job: null, config });
  const data = orderEscPos(claimed.order, printer.paperWidth, claimed.copies).toString("base64");
  return json({ job: { id: claimed.jobId, reference: claimed.order.reference, data }, config });
}

type Body = {
  jobId?: string; ok?: boolean; error?: string;
  report?: { host?: string; version?: string; discovered?: { address?: string }[] };
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return json({ error: "Inconnu" }, 404);
  const body = (await readJson(req).catch(() => null)) as Body | null;
  const info = (printer.agentInfo ?? {}) as Record<string, unknown>;

  if (body?.report) {
    const discovered = ([] as { address?: string }[]).concat(body.report.discovered ?? [])
      .map((d) => String(d.address ?? "").slice(0, 60))
      .filter((a) => /^[0-9.]{7,15}(:\d{1,5})?$/.test(a))
      .slice(0, 30);
    await db.printer.update({
      where: { id: printer.id },
      data: {
        agentInfo: { ...info, host: String(body.report.host ?? "").slice(0, 60), version: String(body.report.version ?? "").slice(0, 20), discovered, scannedAt: new Date().toISOString() },
        scanRequestedAt: null,
        // Une seule imprimante trouvée et aucune choisie : elle est utilisée d'office.
        ...(!printer.address && discovered.length === 1 ? { address: discovered[0] } : {}),
      },
    });
    return json({ ok: true });
  }

  if (!body?.jobId) return json({ error: "jobId manquant" }, 400);
  if (body.jobId === TEST_JOB) {
    await db.printer.update({
      where: { id: printer.id },
      data: { testRequestedAt: null, agentInfo: { ...info, lastTest: { at: new Date().toISOString(), ok: !!body.ok, error: String(body.error ?? "").slice(0, 200) } } },
    });
    return json({ ok: true });
  }
  await completeJob(printer.id, body.jobId, !!body.ok, body.error ?? "");
  if (!body.ok) await db.printer.update({ where: { id: printer.id }, data: { agentInfo: { ...info, lastError: String(body.error ?? "").slice(0, 200), lastErrorAt: new Date().toISOString() } } });
  return json({ ok: true });
}
