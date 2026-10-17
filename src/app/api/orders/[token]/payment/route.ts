import { db } from "@/lib/db";
import { clientIpFrom, json, sameOrigin } from "@/lib/http";
import { handleStripeEvent } from "@/lib/orders/manage";
import { stripeFor } from "@/lib/payments/stripe";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Reprise du paiement d'une commande « paiement en attente » (via son jeton de suivi).
 * Si Stripe indique que le paiement a réussi entre-temps (webhook en retard), la commande est confirmée.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) return json({ error: "Origine refusée" }, 403);
  if (!(await rateLimit(`resume:${clientIpFrom(req)}`, 30, 600))) return json({ error: "Trop de tentatives" }, 429);
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { trackingToken: token },
    include: { payments: { where: { method: "ONLINE_CARD", stripePaymentIntentId: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order || order.status !== "PENDING_PAYMENT") return json({ error: "Aucun paiement en attente", paid: order?.paymentStatus === "PAID" }, 404);
  const payment = order.payments[0];
  const s = await stripeFor(order.restaurantId);
  if (!payment?.stripePaymentIntentId || !s) return json({ error: "Paiement en ligne indisponible" }, 503);

  const intent = await s.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
  if (intent.status === "succeeded") {
    // Rattrapage si le webhook n'est pas encore arrivé.
    await handleStripeEvent({ type: "payment_intent.succeeded", data: { object: intent } } as never);
    return json({ paid: true });
  }
  if (intent.status === "canceled") return json({ error: "Paiement annulé : merci de repasser commande." }, 410);
  return json({ clientSecret: intent.client_secret, publishableKey: s.publishableKey });
}
