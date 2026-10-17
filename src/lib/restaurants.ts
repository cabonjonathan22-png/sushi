import "server-only";
import { cache } from "react";
import { db } from "./db";
import { imageSources, type ImageFiles } from "./images";
import { isOpenAt, isPaused } from "./slots";

/** Informations publiques d'un restaurant (sans aucun secret). */
export const getPublicRestaurant = cache(async (slug: string) => {
  const r = await db.restaurant.findFirst({
    where: { slug, active: true },
    include: {
      openingHours: { orderBy: [{ weekday: "asc" }, { opens: "asc" }] },
      closures: { where: { endDate: { gte: new Date().toISOString().slice(0, 10) } }, orderBy: { startDate: "asc" } },
      zones: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { areas: { orderBy: { city: "asc" } } } },
      paymentMethods: true,
    },
  });
  if (!r) return null;
  const now = new Date();
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    street: r.street,
    postalCode: r.postalCode,
    city: r.city,
    phones: r.phones,
    email: r.email,
    mapsUrl: r.mapsUrl,
    description: r.description,
    timezone: r.timezone,
    services: { DINE_IN: r.dineInEnabled, PICKUP: r.pickupEnabled, DELIVERY: r.deliveryEnabled },
    pickupMinimumCents: r.pickupMinimumCents,
    noAlcoholDelivery: r.noAlcoholDelivery,
    paused: isPaused(r, now),
    pausedReason: r.ordersPausedReason,
    openNow: isOpenAt(now, r.openingHours, r.closures, r.timezone),
    hours: r.openingHours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes, period: h.period })),
    closures: r.closures.map((c) => ({ startDate: c.startDate, endDate: c.endDate, reason: c.reason })),
    zones: r.zones.map((z) => ({
      id: z.id, name: z.name, active: z.active, minLunchCents: z.minLunchCents, minDinnerCents: z.minDinnerCents,
      feeCents: z.feeCents, freeFromCents: z.freeFromCents, etaMinutes: z.etaMinutes,
      areas: z.areas.map((a) => ({ postalCode: a.postalCode, city: a.city })),
    })),
    paymentMethods: r.paymentMethods.map((m) => ({ method: m.method, PICKUP: m.pickup, DELIVERY: m.delivery, DINE_IN: m.dineIn })),
    stripeEnabled: !!(r.stripePublishableKey && r.stripeSecretKeyEnc),
    stripePublishableKey: r.stripePublishableKey,
  };
});

export type PublicRestaurant = NonNullable<Awaited<ReturnType<typeof getPublicRestaurant>>>;

export const listRestaurants = cache(() =>
  db.restaurant.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, street: true, postalCode: true, city: true, phones: true },
  }),
);

export interface SiteContent {
  heroTitle?: string;
  heroTagline?: string;
  intro?: string;
  commitment?: string;
  heroImageId?: string | null;
}

/** Réglages globaux (créés avec les valeurs par défaut s'ils n'existent pas). */
export const getSiteSettings = cache(async () => {
  const s = await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return { ...s, content: (s.content ?? {}) as SiteContent };
});

/** Image du bandeau d'accueil (réglages du site), à la largeur souhaitée. */
export const heroImage = cache(async (width = 1280) => {
  const { content } = await getSiteSettings();
  if (!content.heroImageId) return null;
  const img = await db.image.findUnique({ where: { id: content.heroImageId } });
  return imageSources(img?.files as ImageFiles | undefined, width);
});

/** « Cucuron » → « cucuron », « Cabrières-d'Aigues » → « cabrieres-d-aigues ». */
export function citySlug(city: string): string {
  return city.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface DeliveryTown {
  slug: string;
  city: string;
  postalCodes: string[];
  restaurant: PublicRestaurant;
  zone: PublicRestaurant["zones"][number];
}

/** Communes livrées (une page de référencement local par commune). */
export const deliveryTowns = cache(async (): Promise<DeliveryTown[]> => {
  const restaurants = await Promise.all((await listRestaurants()).map((r) => getPublicRestaurant(r.slug)));
  const towns = new Map<string, DeliveryTown>();
  for (const r of restaurants) {
    if (!r?.services.DELIVERY) continue;
    for (const z of r.zones) {
      for (const a of z.areas) {
        const slug = citySlug(a.city);
        if (!slug) continue;
        const t = towns.get(slug);
        if (t) {
          if (!t.postalCodes.includes(a.postalCode)) t.postalCodes.push(a.postalCode);
        } else towns.set(slug, { slug, city: a.city, postalCodes: [a.postalCode], restaurant: r, zone: z });
      }
    }
  }
  return [...towns.values()].sort((a, b) => a.city.localeCompare(b.city));
});
