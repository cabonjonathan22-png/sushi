import { getStaff } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { subscribeOrders } from "@/lib/realtime";

export const dynamic = "force-dynamic";
// Hébergement serverless : le flux est coupé à cette durée, le navigateur se reconnecte seul.
export const maxDuration = 300;

/**
 * Flux temps réel (Server-Sent Events) pour l'écran des commandes et l'écran cuisine.
 * GET /api/admin/orders/stream?restaurant=<id> — réservé au personnel du restaurant.
 * Le navigateur se reconnecte automatiquement en cas de coupure.
 */
export async function GET(req: Request) {
  const staff = await getStaff();
  const restaurantId = new URL(req.url).searchParams.get("restaurant") ?? "";
  if (!staff || staff.sessionPending2fa || !can(staff.actor, "orders.view", restaurantId)) {
    return new Response("Non autorisé", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("hello", { at: new Date().toISOString() });
      const unsubscribe = subscribeOrders([restaurantId], (e) => send("order", e));
      // Battement toutes les 25 s : garde la connexion ouverte à travers les proxys.
      const ping = setInterval(() => send("ping", Date.now()), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch { /* déjà fermé */ }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // désactive la mise en tampon nginx
    },
  });
}
