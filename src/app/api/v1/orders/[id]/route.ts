import { apiAuth, apiError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { loadOrder, orderToApi } from "@/lib/orders/load";

/** GET /api/v1/orders/{id} — une commande (id ou référence YS-…). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const found = id.startsWith("YS-") ? await db.order.findUnique({ where: { reference: id }, select: { id: true } }) : { id };
  const order = found ? await loadOrder(found.id) : null;
  if (!order || order.restaurantId !== auth.restaurantId) return apiError(404, "not_found", "Commande introuvable.");
  return json({ data: orderToApi(order) });
}
