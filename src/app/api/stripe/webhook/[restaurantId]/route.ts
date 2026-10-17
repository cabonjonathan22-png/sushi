import { db } from "@/lib/db";
import { handleStripeEvent } from "@/lib/orders/manage";
import { stripeFor } from "@/lib/payments/stripe";

/**
 * Webhook Stripe d'un restaurant (chaque restaurant a son compte et son secret de signature).
 * URL à déclarer dans Stripe : https://<site>/api/stripe/webhook/<id du restaurant>
 * Événements : payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled
 */
export async function POST(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const exists = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
  if (!exists) return new Response("Inconnu", { status: 404 });
  const s = await stripeFor(restaurantId);
  if (!s?.webhookSecret) return new Response("Stripe non configuré", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = s.stripe.webhooks.constructEvent(body, signature ?? "", s.webhookSecret);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }
  // Ne traite que les paiements de ce restaurant.
  const obj = event.data.object as { metadata?: Record<string, string> };
  if (obj.metadata?.restaurantId && obj.metadata.restaurantId !== restaurantId) return new Response("ok");
  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error("[stripe] webhook", event.id, e);
    return new Response("Erreur", { status: 500 }); // Stripe renverra l'événement
  }
  return new Response("ok");
}
