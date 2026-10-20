import { getStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureCardNumber } from "@/lib/loyalty-card";
import { hasPermission } from "@/lib/permissions";
import { cardHtml } from "@/lib/print/card-html";
import { getSiteSettings } from "@/lib/restaurants";

/** Carte de fidélité d'un client, à imprimer au restaurant : ?format=carte|ticket&auto=1 */
export async function GET(req: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return Response.redirect(new URL("/admin/connexion", req.url), 303);
  if (!hasPermission(staff.actor, "orders.payment")) return new Response("Accès refusé", { status: 403 });
  const c = await db.customer.findUnique({ where: { id: (await params).customerId } });
  if (!c || c.anonymizedAt) return new Response("Client introuvable", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const html = await cardHtml({
    brand: (await getSiteSettings()).brandName, name: `${c.firstName} ${c.lastName}`.trim() || c.email,
    number: await ensureCardNumber(c.id), format: sp.get("format") === "ticket" ? "ticket" : "carte", auto: sp.get("auto") === "1",
    hint: "Présentez cette carte au restaurant pour cumuler vos points.",
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
