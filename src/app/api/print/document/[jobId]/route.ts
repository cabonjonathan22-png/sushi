import { db } from "@/lib/db";
import { verifyDocumentLink } from "@/lib/print/bizprint";
import { loadOrder } from "@/lib/orders/load";
import { ticketPdf } from "@/lib/print/pdf";

/**
 * PDF du ticket, téléchargé par la station BizPrint du restaurant.
 * Lien signé (HMAC) valable 30 minutes : aucun accès sans signature valide.
 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const sp = new URL(req.url).searchParams;
  if (!verifyDocumentLink(jobId, sp.get("exp") ?? "", sp.get("sig") ?? "")) return new Response("Lien invalide ou expiré", { status: 403 });
  const job = await db.printJob.findUnique({ where: { id: jobId }, include: { printer: true } });
  if (!job) return new Response("Introuvable", { status: 404 });
  const order = await loadOrder(job.orderId);
  if (!order) return new Response("Introuvable", { status: 404 });
  const pdf = await ticketPdf(order, job.printer?.paperWidth ?? "MM80", job.copies);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ticket-${order.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
