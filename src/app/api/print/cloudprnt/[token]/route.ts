import { json } from "@/lib/http";
import { claimJob, completeJob, peekJob, printerByToken } from "@/lib/print/jobs";
import { buildTicket, COLUMNS, renderStarMarkup, renderText } from "@/lib/print/ticket";

/**
 * Star CloudPRNT (mC-Print3, TSP100IV, TSP650II avec interface CloudPRNT…).
 * URL serveur à configurer dans l'imprimante : https://<site>/api/print/cloudprnt/<jeton>
 *  - POST : l'imprimante demande s'il y a un ticket (toutes les quelques secondes) ;
 *  - GET  : elle télécharge le ticket dans le format qu'elle préfère ;
 *  - DELETE : elle confirme l'impression (code 2xx) ou signale une erreur.
 */

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return new Response("Inconnu", { status: 404 });
  const job = await peekJob(printer.id);
  if (!job) return json({ jobReady: false });
  return json({ jobReady: true, mediaTypes: ["text/vnd.star.markup", "text/plain"], jobToken: job.id });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return new Response("Inconnu", { status: 404 });
  const url = new URL(req.url);
  const claimed = await claimJob(printer.id, url.searchParams.get("token") ?? undefined);
  if (!claimed) return new Response("", { status: 204 });
  const cols = COLUMNS[printer.paperWidth];
  const labels = claimed.copies > 1 ? ["CUISINE", claimed.order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, claimed.copies) : [undefined];
  const tickets = labels.map((l) => buildTicket(claimed.order, l));
  const type = url.searchParams.get("type") ?? "text/plain";
  const body = type === "text/vnd.star.markup"
    ? tickets.map((t) => renderStarMarkup(t, cols)).join("\n")
    : tickets.map((t) => renderText(t, cols)).join("\n\n\n\n");
  return new Response(body, {
    headers: { "Content-Type": `${type === "text/vnd.star.markup" ? type : "text/plain"}; charset=utf-8`, "X-Star-Cut": "partial; feed=true" },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const printer = await printerByToken((await params).token);
  if (!printer) return new Response("Inconnu", { status: 404 });
  const url = new URL(req.url);
  const jobId = url.searchParams.get("token");
  const code = url.searchParams.get("code") ?? "200";
  if (jobId) await completeJob(printer.id, jobId, code.startsWith("2"), `Star ${code}`);
  return new Response("", { status: 200 });
}
