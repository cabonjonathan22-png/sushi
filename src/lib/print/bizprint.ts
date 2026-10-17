import { decryptSecret } from "../crypto";
import { db } from "../db";
import { documentUrl, signGet, signPost, type BizPrintKeys } from "./bizprint-sign";

export { documentUrl, signGet, signPost, verifyDocumentLink, type BizPrintKeys } from "./bizprint-sign";

/**
 * BizPrint (BizSwoop) — https://print.bizswoop.app
 * Le restaurant installe la « station » BizPrint sur un PC / Raspberry Pi / Android, qui voit
 * ses imprimantes (USB, réseau, A4…). On envoie à l'API l'URL d'un ticket PDF et le n° de
 * l'imprimante ; la station télécharge le PDF et l'imprime.
 * Signature : identique au client officiel (bizswoop-development/bizprint-mcp-server).
 */

const BASE = process.env.BIZPRINT_API_URL ?? "https://print.bizswoop.app/api/connect-application/v1";

export async function bizprintKeys(restaurantId: string): Promise<BizPrintKeys | null> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { bizprintPublicKey: true, bizprintSecretEnc: true } });
  if (!r?.bizprintPublicKey || !r.bizprintSecretEnc) return null;
  return { publicKey: r.bizprintPublicKey, secretKey: decryptSecret(r.bizprintSecretEnc) };
}

async function call<T>(keys: BizPrintKeys, method: "GET" | "POST", path: string, data: Record<string, unknown> = {}): Promise<T> {
  const url = method === "GET" ? `${BASE}${path}?${signGet(data as Record<string, string>, keys)}` : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
    body: method === "POST" ? JSON.stringify(signPost(data, keys)) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string; errorCode?: string } | null;
    throw new Error(`BizPrint ${res.status} : ${err?.message ?? err?.errorCode ?? res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface BizPrintPrinter { id: number; title: string; enabled: boolean; station: number; paperSize: string }

/** Imprimantes du compte BizPrint (pour les choisir dans le back-office). */
export async function listBizPrintPrinters(keys: BizPrintKeys): Promise<BizPrintPrinter[]> {
  const body = await call<BizPrintPrinter[] | { data: BizPrintPrinter[] }>(keys, "GET", "/printers", { perPage: "100" });
  return Array.isArray(body) ? body : body.data;
}

// ───────────── Envoi et suivi ─────────────

/** Tâche « bizprint » : envoie le ticket à l'imprimante BizPrint. */
export async function submitBizPrint(payload: { printJobId: string }) {
  const job = await db.printJob.findUnique({ where: { id: payload.printJobId }, include: { printer: true, order: { select: { reference: true, dailyNumber: true, restaurantId: true } } } });
  if (!job?.printer || job.status === "DONE" || job.remoteJobId) return;
  const keys = await bizprintKeys(job.printer.restaurantId);
  if (!keys) throw new Error("Clés BizPrint non configurées pour ce restaurant");
  const printerId = Number(job.printer.remotePrinterId);
  if (!printerId) throw new Error(`N° d'imprimante BizPrint manquant pour « ${job.printer.name} »`);
  try {
    const res = await call<{ job: { id: number; status: string } }>(keys, "POST", "/jobs", {
      printerId,
      url: documentUrl(job.id),
      description: `Commande n° ${job.order.dailyNumber} (${job.order.reference})`,
    });
    await db.printJob.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, remoteJobId: String(res.job.id), lastError: "" } });
  } catch (e) {
    await db.printJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: (e as Error).message.slice(0, 300) } });
    throw e;
  }
}

/** Met à jour le statut des tickets envoyés à BizPrint (appelé par le worker). */
export async function refreshBizPrintJobs(): Promise<void> {
  const jobs = await db.printJob.findMany({
    where: { status: "SENT", remoteJobId: { not: "" }, printer: { method: "BIZPRINT" }, sentAt: { gt: new Date(Date.now() - 24 * 3600_000) } },
    include: { printer: { select: { restaurantId: true } } },
    take: 50,
  });
  for (const j of jobs) {
    const keys = await bizprintKeys(j.printer!.restaurantId);
    if (!keys) continue;
    try {
      const remote = await call<{ status: string }>(keys, "GET", `/jobs/${j.remoteJobId}`);
      const s = remote.status.toUpperCase();
      if (s === "COMPLETED" || s === "DONE" || s === "PRINTED") await db.printJob.update({ where: { id: j.id }, data: { status: "DONE", doneAt: new Date() } });
      else if (s === "FAILED" || s === "ERROR") await db.printJob.update({ where: { id: j.id }, data: { status: "FAILED", lastError: `BizPrint : ${remote.status}` } });
    } catch (e) {
      console.error("[bizprint] statut", j.id, (e as Error).message);
    }
  }
}
