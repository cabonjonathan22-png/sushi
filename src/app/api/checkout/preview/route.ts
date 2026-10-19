import { z } from "zod";
import { getCustomer } from "@/lib/auth/session";
import { priceCart } from "@/lib/cart";
import { readConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { clientIpFrom, json, readJson } from "@/lib/http";
import { activeRewards, balanceOf, toRule } from "@/lib/loyalty";
import { pointsFor, rewardProblem } from "@/lib/loyalty-rules";
import { catalogMap, loadMenu } from "@/lib/menu";
import { rateLimit } from "@/lib/rate-limit";

const Input = z.object({
  restaurantSlug: z.string().max(80),
  mode: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]),
  period: z.enum(["LUNCH", "DINNER"]),
  zoneId: z.string().max(40).nullish(),
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
  rewardId: z.string().trim().max(40).optional(),
  lines: z.array(z.object({
    productId: z.string().max(40), variantId: z.string().max(40).nullish(),
    optionIds: z.array(z.string().max(40)).max(20).optional(), quantity: z.number().int().min(1).max(50),
  })).max(80),
});

/**
 * Récapitulatif calculé par le serveur (remise, frais, minimum, TVA) pendant la saisie,
 * avec la carte de fidélité : solde du client connecté, récompenses utilisables, points à gagner.
 */
export async function POST(req: Request) {
  if (!(await rateLimit(`preview:${clientIpFrom(req)}`, 120, 60))) return json({ error: "Trop de requêtes" }, 429);
  const parsed = Input.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return json({ error: "Requête invalide" }, 400);
  const input = parsed.data;
  const r = await db.restaurant.findFirst({ where: { slug: input.restaurantSlug, active: true }, include: { zones: { include: { areas: true } } } });
  if (!r) return json({ error: "Restaurant introuvable" }, 404);
  const zone = input.mode === "DELIVERY" ? r.zones.find((z) => z.id === input.zoneId && z.active) ?? null : null;
  const promo = input.promoCode ? await db.promoCode.findUnique({ where: { code: input.promoCode } }) : null;

  const { loyalty: settings } = await readConfig();
  const customer = settings.enabled ? await getCustomer() : null;
  const balance = customer ? await balanceOf(customer.id) : 0;
  const rewards = settings.enabled ? await activeRewards() : [];
  const chosen = customer && input.rewardId ? rewards.find((x) => x.id === input.rewardId) ?? null : null;

  const catalog = catalogMap(await loadMenu(r.id));
  const ctx = {
    restaurantId: r.id, mode: input.mode, period: input.period, zone, pickupMinimumCents: r.pickupMinimumCents,
    noAlcoholDelivery: r.noAlcoholDelivery, promo, now: new Date(), pointsBalance: balance,
  };
  const cart = priceCart(input.lines, catalog, { ...ctx, reward: chosen ? toRule(chosen) : null });
  // Sous-total facturé (hors petits plus offerts) : base des minimums des récompenses.
  const base = priceCart(input.lines, catalog, ctx);
  const subtotal = base.subtotalCents - base.extrasDiscountCents;

  return json({
    ...cart,
    promoError: input.promoCode && !promo ? "Code promo inconnu." : cart.promoError,
    loyalty: settings.enabled ? {
      loggedIn: !!customer,
      balance,
      pointsToEarn: pointsFor(cart.totalCents - cart.deliveryFeeCents, settings.pointsPerEuro),
      rewards: rewards.map((x) => {
        const problem = customer ? rewardProblem(toRule(x), balance, subtotal) : "LOGIN_REQUIRED";
        return {
          id: x.id, name: x.name, description: x.description, type: x.type, value: x.value, productName: x.product?.name ?? "",
          pointsCost: x.pointsCost, minSubtotalCents: x.minSubtotalCents, problem,
        };
      }),
    } : null,
  });
}
