import { z } from "zod";
import { apiAuth, apiError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { clientIpFrom, json, readJson } from "@/lib/http";
import { loadOrder, orderToApi } from "@/lib/orders/load";
import { changeStatus, OrderError } from "@/lib/orders/manage";

const Body = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"]),
  note: z.string().max(300).optional(),
});

/** POST /api/v1/orders/{id}/status  { "status": "READY", "note": "…" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const parsed = Body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Corps invalide.");
  const order = await db.order.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!order || order.restaurantId !== auth.restaurantId) return apiError(404, "not_found", "Commande introuvable.");
  try {
    await changeStatus(id, parsed.data.status, { userId: null, label: `API : ${auth.keyName}`, ip: clientIpFrom(req) }, parsed.data.note ?? "");
  } catch (e) {
    if (e instanceof OrderError) return apiError(409, "invalid_transition", e.message);
    throw e;
  }
  return json({ data: orderToApi((await loadOrder(id))!) });
}
