import { z } from "zod";
import { balanceOf, lockCustomer, onLoyaltyStatus, toRule } from "../loyalty";
import type { RewardRule } from "../loyalty-rules";
import { audit } from "../audit";
import { readConfig } from "../config";
import { priceCart, type CartError, type PricedCart } from "../cart";
import { randomToken } from "../crypto";
import { db, type Tx } from "../db";
import { catalogMap, loadMenu } from "../menu";
import { createPaymentIntent, stripeFor } from "../payments/stripe";
import { computeSlots, findAvailableSlot, isPaused } from "../slots";
import { money } from "../money";
import { localDate } from "../time";
import { findZone } from "../zones";
import { onOrderConfirmed } from "./notify";

/** Données envoyées par le formulaire de commande (aucun prix : tout est recalculé ici). */
export const CheckoutInput = z.object({
  restaurantSlug: z.string().min(1).max(80),
  mode: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]),
  slotStart: z.string().datetime(),
  lines: z
    .array(z.object({
      productId: z.string().min(1).max(40),
      variantId: z.string().max(40).nullish(),
      optionIds: z.array(z.string().max(40)).max(20).optional(),
      quantity: z.number().int().min(1).max(50),
    }))
    .min(1)
    .max(80),
  customer: z.object({
    firstName: z.string().trim().min(1, "Prénom requis").max(60),
    lastName: z.string().trim().min(1, "Nom requis").max(60),
    phone: z.string().trim().regex(/^\+?[0-9 .()-]{8,20}$/, "Numéro de téléphone invalide"),
    // Obligatoire ou non selon la Configuration (vérifié dans placeOrder).
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail invalide").max(160)]).default(""),
  }),
  address: z
    .object({
      street: z.string().trim().min(3, "Adresse requise").max(160),
      extra: z.string().trim().max(160).default(""),
      // Tous pays : chiffres, lettres, espace, tiret (France : 5 chiffres, contrôlé par la zone).
      postalCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 -]{1,9}$/, "Code postal invalide"),
      city: z.string().trim().min(1).max(80),
      notes: z.string().trim().max(300).default(""),
    })
    .nullish(),
  notes: z.string().trim().max(500).default(""),
  paymentMethod: z.enum(["ONLINE_CARD", "CASH", "CARD_TERMINAL", "MEAL_VOUCHER_PAPER", "MEAL_VOUCHER_CARD"]),
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
  /** Récompense de fidélité choisie (client connecté). */
  rewardId: z.string().trim().max(40).optional(),
  ageConfirmed: z.boolean().default(false),
  acceptTerms: z.literal(true, { message: "Veuillez accepter les conditions générales de vente." }),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export type PlaceResult =
  | { ok: true; orderId: string; trackingToken: string; payment: { clientSecret: string; publishableKey: string } | null }
  | { ok: false; errors: CartError[] | { code: string; message: string; params?: Record<string, string | number> }[]; cart?: PricedCart };

const fail = (message: string, code = "INVALID"): PlaceResult => ({ ok: false, errors: [{ code, message }] });

/** Un paiement en ligne non finalisé bloque son créneau pendant 30 minutes. */
const PENDING_HOLD_MINUTES = 30;

async function nextCounter(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1 RETURNING "value"`;
  return rows[0]!.value;
}

/** Commandes qui occupent un créneau (hors annulées et paiements abandonnés). */
function slotTakenWhere(restaurantId: string) {
  return {
    restaurantId,
    OR: [
      { status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] as ("CANCELLED" | "PENDING_PAYMENT")[] } },
      { status: "PENDING_PAYMENT" as const, placedAt: { gt: new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000) } },
    ],
  };
}

/** Nombre de commandes par créneau à venir (pour marquer les créneaux complets). */
export async function slotCounts(restaurantId: string, from: Date): Promise<Map<string, number>> {
  const rows = await db.order.groupBy({
    by: ["slotStart"],
    where: { ...slotTakenWhere(restaurantId), slotStart: { gte: from } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.slotStart.toISOString(), r._count._all]));
}

export async function placeOrder(raw: unknown, ctx: { ip: string; customerId?: string | null; now?: Date; locale?: string }): Promise<PlaceResult> {
  const parsed = CheckoutInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire incomplet.", "FORM");
  const input = parsed.data;
  const now = ctx.now ?? new Date();

  const restaurant = await db.restaurant.findFirst({
    where: { slug: input.restaurantSlug, active: true },
    include: { openingHours: true, closures: true, zones: { include: { areas: true } }, paymentMethods: true },
  });
  if (!restaurant) return fail("Restaurant introuvable.", "FORM");
  if (isPaused(restaurant, now)) return fail(restaurant.ordersPausedReason || "Les commandes sont momentanément fermées.", "PAUSED");

  const modeEnabled = { PICKUP: restaurant.pickupEnabled, DELIVERY: restaurant.deliveryEnabled, DINE_IN: restaurant.dineInEnabled }[input.mode];
  if (!modeEnabled) return fail("Ce mode de commande n'est pas proposé.", "FORM");

  // Zone de livraison (vérifiée sur le couple code postal + commune).
  let zone = null;
  if (input.mode === "DELIVERY") {
    if (!input.address) return fail("Adresse de livraison requise.", "FORM");
    zone = findZone(restaurant.zones, input.address.postalCode, input.address.city);
    if (!zone) return fail(`Nous ne livrons pas encore ${input.address.city} (${input.address.postalCode}).`, "NO_ZONE");
  }

  // Créneau : doit faire partie des créneaux proposés et ne pas être complet.
  const taken = await slotCounts(restaurant.id, now);
  const days = computeSlots({
    now, settings: restaurant, hours: restaurant.openingHours, closures: restaurant.closures,
    extraMinutes: zone?.etaMinutes ?? 0, taken,
  });
  const slot = findAvailableSlot(days, new Date(input.slotStart).toISOString());
  if (!slot) return fail("Ce créneau n'est plus disponible, merci d'en choisir un autre.", "SLOT_UNAVAILABLE");

  // Moyen de paiement autorisé pour ce mode.
  const pm = restaurant.paymentMethods.find((m) => m.method === input.paymentMethod);
  const pmOk = pm && { PICKUP: pm.pickup, DELIVERY: pm.delivery, DINE_IN: pm.dineIn }[input.mode];
  if (!pmOk) return fail("Ce moyen de paiement n'est pas accepté pour ce mode.", "FORM");
  const stripe = input.paymentMethod === "ONLINE_CARD" ? await stripeFor(restaurant.id) : null;
  if (input.paymentMethod === "ONLINE_CARD" && !stripe) return fail("Le paiement en ligne est momentanément indisponible.", "STRIPE");

  // Prix : recalcul complet côté serveur.
  const menu = await loadMenu(restaurant.id);
  const promo = input.promoCode ? await db.promoCode.findUnique({ where: { code: input.promoCode } }) : null;
  if (input.promoCode && !promo) return fail("Code promo inconnu.", "PROMO");
  const config = await readConfig();
  if (config.orders.requireEmail && !input.customer.email) return fail("E-mail requis pour recevoir la confirmation.", "EMAIL_REQUIRED");

  // Fidélité : récompense réservée aux clients connectés, vérifiée sur leur solde de points.
  let reward: RewardRule | null = null;
  let pointsBalance = 0;
  if (input.rewardId) {
    if (!config.loyalty.enabled) return fail("La carte de fidélité n'est pas active.", "REWARD_INACTIVE");
    if (!ctx.customerId) return fail("Connectez-vous à votre compte pour utiliser vos points.", "REWARD_LOGIN_REQUIRED");
    const row = await db.loyaltyReward.findUnique({ where: { id: input.rewardId } });
    if (!row) return fail("Cette récompense n'existe plus.", "REWARD_INACTIVE");
    reward = toRule(row);
    pointsBalance = await balanceOf(ctx.customerId);
  }
  const cart = priceCart(input.lines, catalogMap(menu), {
    restaurantId: restaurant.id, mode: input.mode, period: slot.period, zone,
    pickupMinimumCents: restaurant.pickupMinimumCents, noAlcoholDelivery: restaurant.noAlcoholDelivery, promo, now,
    maxLineQuantity: config.orders.maxLineQuantity, reward, pointsBalance,
  });
  if (!cart.ok) return { ok: false, errors: cart.errors, cart };
  if (input.promoCode && cart.promoError) return fail(cart.promoError, "PROMO");
  if (reward && cart.rewardError) {
    const messages: Record<string, string> = {
      NOT_ENOUGH_POINTS: `Il vous faut ${reward.pointsCost} points pour cette récompense (solde : ${pointsBalance}).`,
      MINIMUM: `Cette récompense est valable dès ${(reward.minSubtotalCents / 100).toFixed(2).replace(".", ",")} € d'achat.`,
      PRODUCT_UNAVAILABLE: "Le produit offert n'est pas disponible pour cette commande.",
      INACTIVE: "Cette récompense n'est plus proposée.",
    };
    return { ok: false, errors: [{ code: `REWARD_${cart.rewardError}`, message: messages[cart.rewardError] ?? messages.INACTIVE!, params: { points: reward.pointsCost, balance: pointsBalance, min: money(reward.minSubtotalCents) } }] };
  }
  if (cart.containsAlcohol && !input.ageConfirmed) return fail("Votre commande contient de l'alcool : confirmez avoir 18 ans ou plus.", "AGE");
  if (cart.totalCents <= 0 && input.paymentMethod === "ONLINE_CARD") return fail("Montant nul : choisissez un paiement sur place.", "FORM");

  const online = input.paymentMethod === "ONLINE_CARD";
  // Acceptation automatique (Configuration) : la commande arrive directement « Acceptée ».
  const firstStatus = online ? "PENDING_PAYMENT" : config.orders.autoAccept ? "ACCEPTED" : "NEW";
  const customerName = `${input.customer.firstName} ${input.customer.lastName}`;

  let pointsShortage = false;
  const order = await db.$transaction(async (tx) => {
    // Verrou par restaurant + créneau : deux commandes simultanées ne dépassent jamais la capacité.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurant.id + slot.start.toISOString()}))`;
    // Points revérifiés sous verrou : deux commandes simultanées ne dépensent pas deux fois les mêmes points.
    if (cart.rewardApplied && ctx.customerId) {
      await lockCustomer(tx, ctx.customerId);
      if ((await balanceOf(ctx.customerId, tx)) < cart.rewardApplied.pointsCost) {
        pointsShortage = true;
        return null;
      }
    }
    if (restaurant.maxOrdersPerSlot !== null) {
      const count = await tx.order.count({ where: { ...slotTakenWhere(restaurant.id), slotStart: slot.start } });
      if (count >= restaurant.maxOrdersPerSlot) return null;
    }
    const number = await nextCounter(tx, `order:${restaurant.id}`);
    const dailyNumber = await nextCounter(tx, `daily:${restaurant.id}:${localDate(now, restaurant.timezone)}`);
    const created = await tx.order.create({
      data: {
        restaurantId: restaurant.id,
        number,
        dailyNumber,
        reference: `YS-${restaurant.slug.slice(0, 3).toUpperCase()}-${String(number).padStart(6, "0")}`,
        trackingToken: randomToken(24),
        source: "WEB",
        status: firstStatus,
        acceptedAt: firstStatus === "ACCEPTED" ? now : null,
        paymentStatus: online ? "PENDING" : "UNPAID",
        paymentMethod: input.paymentMethod,
        mode: input.mode,
        period: slot.period,
        slotStart: slot.start,
        slotEnd: slot.end,
        customerId: ctx.customerId ?? null,
        customerName,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email,
        addressStreet: input.address?.street ?? "",
        addressExtra: input.address?.extra ?? "",
        postalCode: input.address?.postalCode ?? "",
        city: input.address?.city ?? "",
        deliveryNotes: input.address?.notes ?? "",
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? "",
        notes: config.orders.allowNotes ? input.notes : "",
        promoCode: cart.promoApplied ?? "",
        loyaltyRewardId: cart.rewardApplied?.id ?? null,
        loyaltyRewardName: cart.rewardApplied?.name ?? "",
        loyaltyPointsSpent: cart.rewardApplied?.pointsCost ?? 0,
        loyaltyDiscountCents: cart.loyaltyDiscountCents,
        subtotalCents: cart.subtotalCents,
        discountCents: cart.discountCents,
        extrasDiscountCents: cart.extrasDiscountCents,
        deliveryFeeCents: cart.deliveryFeeCents,
        totalCents: cart.totalCents,
        vatBreakdown: cart.vatBreakdown as unknown as object,
        ageConfirmed: input.ageConfirmed,
        locale: ctx.locale ?? "",
        lines: {
          create: cart.lines.map((l, i) => ({
            productId: l.productId, variantId: l.variantId, name: l.name, variantLabel: l.variantLabel,
            options: l.options, categoryName: l.categoryName, unitPriceCents: l.unitPriceCents,
            quantity: l.quantity, vatRate: l.vatRate, totalCents: l.totalCents, isAlcohol: l.isAlcohol, sortOrder: i,
          })),
        },
        statusEvents: { create: { from: null, to: firstStatus, actor: "Client", note: firstStatus === "ACCEPTED" ? "Acceptation automatique" : "" } },
      },
    });
    if (cart.promoApplied) await tx.promoCode.update({ where: { code: cart.promoApplied }, data: { usedCount: { increment: 1 } } });
    if (cart.rewardApplied && ctx.customerId) {
      await tx.loyaltyTransaction.create({
        data: { customerId: ctx.customerId, kind: "REDEEM", points: -cart.rewardApplied.pointsCost, orderId: created.id, rewardId: cart.rewardApplied.id, note: cart.rewardApplied.name },
      });
    }
    if (!online) await onOrderConfirmed(tx, created);
    await audit({ actor: "Client", action: "order.create", entityType: "Order", entityId: created.id, restaurantId: restaurant.id,
      data: { reference: created.reference, total: created.totalCents, mode: created.mode, payment: created.paymentMethod }, ip: ctx.ip }, tx);
    return created;
  });
  if (!order && pointsShortage) return fail("Votre solde de points ne suffit plus pour cette récompense.", "REWARD_NOT_ENOUGH_POINTS");
  if (!order) return fail("Ce créneau vient d'être complet, merci d'en choisir un autre.", "SLOT_UNAVAILABLE");

  // Paiement en ligne : PaymentIntent Stripe (la commande passe en « Nouvelle » via le webhook).
  if (online && stripe) {
    try {
      const intent = await createPaymentIntent(stripe.stripe, order);
      await db.payment.create({
        data: { orderId: order.id, method: "ONLINE_CARD", amountCents: order.totalCents, status: "PENDING", stripePaymentIntentId: intent.id },
      });
      return { ok: true, orderId: order.id, trackingToken: order.trackingToken, payment: { clientSecret: intent.client_secret!, publishableKey: stripe.publishableKey } };
    } catch (e) {
      console.error("[stripe] création du paiement impossible", e);
      await db.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelReason: "Paiement en ligne indisponible" } });
        await tx.orderStatusEvent.create({ data: { orderId: order.id, from: "PENDING_PAYMENT", to: "CANCELLED", actor: "Système", note: "Stripe indisponible" } });
        await onLoyaltyStatus(tx, order, "CANCELLED"); // points de la récompense rendus
      });
      return fail("Le paiement en ligne est momentanément indisponible. Choisissez un paiement sur place ou réessayez.", "STRIPE");
    }
  }
  return { ok: true, orderId: order.id, trackingToken: order.trackingToken, payment: null };
}
