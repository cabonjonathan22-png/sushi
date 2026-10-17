import { claimJob, completeJob, printerByToken } from "@/lib/print/jobs";
import { buildTicket, COLUMNS, renderEpsonXml } from "@/lib/print/ticket";

/**
 * Epson Server Direct Print (TM-m30, TM-T88VI/VII, TM-T20III avec interface réseau…).
 * Dans l'interface web de l'imprimante (Server Direct Print), URL :
 *   https://<site>/api/print/epson/<jeton>   — intervalle conseillé : 5 s.
 * L'imprimante envoie « GetRequest » (demande de ticket) puis « SetResponse » (résultat).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return new Response("Inconnu", { status: 404 });
  const form = new URLSearchParams(await req.text());
  const type = form.get("ConnectionType");

  if (type === "SetResponse") {
    const xml = form.get("ResponseFile") ?? "";
    const jobId = xml.match(/<printjobid>([^<]+)<\/printjobid>/)?.[1];
    const ok = /success="true"/.test(xml);
    if (jobId) await completeJob(printer.id, jobId, ok, ok ? "" : `Epson : ${xml.match(/code="([^"]*)"/)?.[1] ?? "erreur"}`);
    return new Response("", { status: 200 });
  }

  // GetRequest : un ticket à imprimer ?
  const claimed = await claimJob(printer.id);
  if (!claimed) return new Response("", { status: 200 });
  const cols = COLUMNS[printer.paperWidth];
  const labels = claimed.copies > 1 ? ["CUISINE", claimed.order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, claimed.copies) : [undefined];
  const body = labels.map((l) => `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid>${claimed.jobId}</printjobid></Parameter><PrintData>${renderEpsonXml(buildTicket(claimed.order, l), cols)}</PrintData></ePOSPrint>`).join("");
  return new Response(`<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="2.00">${body}</PrintRequestInfo>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
