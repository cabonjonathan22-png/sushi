import { getStaff } from "@/lib/auth/session";
import { loadOrder } from "@/lib/orders/load";
import { can } from "@/lib/permissions";
import { ticketHtml, type Paper } from "@/lib/print/html";

/** Ticket imprimable : /admin/commandes/<id>/ticket?papier=58|80|A4&copies=1..3&auto=1 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return Response.redirect(new URL("/admin/connexion", req.url), 303);
  const order = await loadOrder((await params).id);
  if (!order) return new Response("Commande introuvable", { status: 404 });
  if (!can(staff.actor, "orders.print", order.restaurantId)) return new Response("Accès refusé", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const paper = (["58", "80", "A4"].includes(sp.get("papier") ?? "") ? sp.get("papier") : "80") as Paper;
  const html = ticketHtml(order, { paper, copies: Number(sp.get("copies")) || 1, auto: sp.get("auto") === "1" });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
