import { z } from "zod";
import { priceCart } from "@/lib/cart";
import { db } from "@/lib/db";
import { clientIpFrom, json, readJson } from "@/lib/http";
import { catalogMap, loadMenu } from "@/lib/menu";
import { rateLimit } from "@/lib/rate-limit";

const Input = z.object({
  restaurantSlug: z.string().max(80),
  mode: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]),
  period: z.enum(["LUNCH", "DINNER"]),
  zoneId: z.string().max(40).nullish(),
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
  lines: z.array(z.object({
    productId: z.string().max(40), variantId: z.string().max(40).nullish(),
    optionIds: z.array(z.string().max(40)).max(20).optional(), quantity: z.number().int().min(1).max(50),
  })).max(80),
});

/** Récapitulatif calculé par le serveur (remise, frais, minimum, TVA) pendant la saisie. */
export async function POST(req: Request) {
  if (!(await rateLimit(`preview:${clientIpFrom(req)}`, 120, 60))) return json({ error: "Trop de requêtes" }, 429);
  const parsed = Input.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return json({ error: "Requête invalide" }, 400);
  const input = parsed.data;
  const r = await db.restaurant.findFirst({ where: { slug: input.restaurantSlug, active: true }, include: { zones: { include: { areas: true } } } });
  if (!r) return json({ error: "Restaurant introuvable" }, 404);
  const zone = input.mode === "DELIVERY" ? r.zones.find((z) => z.id === input.zoneId && z.active) ?? null : null;
  const promo = input.promoCode ? await db.promoCode.findUnique({ where: { code: input.promoCode } }) : null;
  const cart = priceCart(input.lines, catalogMap(await loadMenu(r.id)), {
    restaurantId: r.id, mode: input.mode, period: input.period, zone, pickupMinimumCents: r.pickupMinimumCents,
    noAlcoholDelivery: r.noAlcoholDelivery, promo, now: new Date(),
  });
  return json({ ...cart, promoError: input.promoCode && !promo ? "Code promo inconnu." : cart.promoError });
}
