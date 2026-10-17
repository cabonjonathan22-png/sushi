import { hmacSha256 } from "./crypto";
import { db } from "./db";
import { loadOrder, orderToApi } from "./orders/load";

/**
 * Webhooks sortants signés (comme Stripe) :
 *   X-Yaoma-Signature: t=<horodatage>,v1=<HMAC-SHA256(secret, "<t>.<corps>")>
 * Le destinataire recalcule la signature et refuse si l'horodatage a plus de 5 minutes.
 * Un échec (réseau, code ≠ 2xx) est relancé automatiquement par la file de tâches.
 */

export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

export async function deliverWebhook(payload: { endpointId: string; event: string; orderId: string; at: string }) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: payload.endpointId } });
  if (!endpoint || !endpoint.active) return; // supprimé ou désactivé entre-temps : rien à faire
  const order = await loadOrder(payload.orderId);
  if (!order) return;
  const body = JSON.stringify({ id: `${payload.event}:${payload.orderId}:${payload.at}`, type: payload.event, createdAt: payload.at, data: { order: orderToApi(order) } });
  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Yaoma-Webhooks/1.0", "X-Yaoma-Event": payload.event, "X-Yaoma-Signature": signPayload(endpoint.secret, body) },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook ${endpoint.url} → HTTP ${res.status}`);
}
