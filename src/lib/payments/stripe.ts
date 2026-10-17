import Stripe from "stripe";
import { decryptSecret } from "../crypto";
import { readConfig } from "../config";
import { db } from "../db";

/**
 * Stripe par restaurant : chaque restaurant peut avoir son propre compte.
 * Les clés sont chiffrées en base (AES-256-GCM) et ne quittent jamais le serveur,
 * sauf la clé publiable (pk_…).
 */

export async function stripeFor(restaurantId: string): Promise<{ stripe: Stripe; publishableKey: string; webhookSecret: string } | null> {
  const r = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripePublishableKey: true, stripeSecretKeyEnc: true, stripeWebhookSecretEnc: true },
  });
  if (!r?.stripeSecretKeyEnc || !r.stripePublishableKey) return null;
  return {
    stripe: new Stripe(decryptSecret(r.stripeSecretKeyEnc), { appInfo: { name: "Yaoma" }, maxNetworkRetries: 2 }),
    publishableKey: r.stripePublishableKey,
    webhookSecret: decryptSecret(r.stripeWebhookSecretEnc),
  };
}

/** Crée (ou retrouve, grâce à la clé d'idempotence) le PaymentIntent d'une commande. */
export async function createPaymentIntent(
  stripe: Stripe,
  order: { id: string; reference: string; totalCents: number; restaurantId: string; customerEmail: string },
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create(
    {
      amount: order.totalCents,
      // Devise du site (Configuration → Région). Montants en centimes : devises à 2 décimales.
      currency: (await readConfig()).region.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true }, // CB, Apple Pay, Google Pay selon l'appareil
      description: `Commande ${order.reference}`,
      receipt_email: order.customerEmail || undefined,
      metadata: { orderId: order.id, restaurantId: order.restaurantId, reference: order.reference },
    },
    { idempotencyKey: `order-${order.id}` },
  );
}
