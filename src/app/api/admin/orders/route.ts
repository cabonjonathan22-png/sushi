import { getStaff } from "@/lib/auth/session";
import { json } from "@/lib/http";
import { boardOrders } from "@/lib/orders/board";
import { can } from "@/lib/permissions";

/** GET /api/admin/orders?restaurant=<id> — commandes en cours (personnel uniquement). */
export async function GET(req: Request) {
  const staff = await getStaff();
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurant") ?? "";
  if (!staff || staff.sessionPending2fa || !can(staff.actor, "orders.view", restaurantId)) return json({ error: "Non autorisé" }, 401);
  const done = Math.min(240, Number(url.searchParams.get("done") ?? 0) || 0);
  return json({ orders: await boardOrders(restaurantId, { includeDoneMinutes: done }), at: new Date().toISOString() });
}
