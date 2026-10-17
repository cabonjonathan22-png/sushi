import { apiAuth, apiError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { loadOrder, orderToApi } from "@/lib/orders/load";

const STATUSES = ["PENDING_PAYMENT", "NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const;

/**
 * GET /api/v1/orders?status=NEW,ACCEPTED&updated_since=ISO&limit=50&cursor=<id>
 * Commandes du restaurant de la clé, contenu complet. Tri : dernière mise à jour croissante
 * (pratique pour synchroniser : relancer avec updated_since = updatedAt du dernier reçu).
 */
export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const statuses = (url.searchParams.get("status") ?? "").split(",").filter(Boolean);
  if (statuses.some((s) => !STATUSES.includes(s as never))) return apiError(400, "invalid_status", `Statuts possibles : ${STATUSES.join(", ")}`);
  const since = url.searchParams.get("updated_since");
  const sinceDate = since ? new Date(since) : null;
  if (since && Number.isNaN(sinceDate!.getTime())) return apiError(400, "invalid_date", "updated_since doit être une date ISO 8601.");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const cursor = url.searchParams.get("cursor");

  const rows = await db.order.findMany({
    where: {
      restaurantId: auth.restaurantId,
      ...(statuses.length ? { status: { in: statuses as (typeof STATUSES)[number][] } } : { status: { not: "PENDING_PAYMENT" } }),
      ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true },
  });
  const page = rows.slice(0, limit);
  const orders = (await Promise.all(page.map((r) => loadOrder(r.id)))).filter((o): o is NonNullable<typeof o> => !!o);
  return json({ data: orders.map(orderToApi), next_cursor: rows.length > limit ? page.at(-1)!.id : null });
}
