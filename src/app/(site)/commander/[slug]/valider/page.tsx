import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/order/Checkout";
import { getCustomer } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { getPublicRestaurant } from "@/lib/restaurants";
import { loadMenu } from "@/lib/menu";
import { translateMenu } from "@/i18n/content";
import { getI18n } from "@/i18n/server";

export const metadata: Metadata = { title: "Valider ma commande", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const restaurant = await getPublicRestaurant((await params).slug);
  if (!restaurant) notFound();
  const { stripePublishableKey: _pk, ...publicRestaurant } = restaurant;
  const c = await getCustomer();
  const account = c
    ? {
        customer: { firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email },
        addresses: c.addresses.map((a) => ({ street: a.street, extra: a.extra, postalCode: a.postalCode, city: a.city, notes: a.notes })),
      }
    : null;
  const config = await getConfig();
  // Compléments proposés à la fin de la commande (sauce soja, baguettes, wasabi…), dans la langue du visiteur.
  const { locale, defaultLocale } = await getI18n();
  const original = await loadMenu(restaurant.id);
  const { menu } = locale === defaultLocale ? { menu: original } : await translateMenu(original, locale);
  const byId = new Map(menu.products.map((p) => [p.id, p]));
  const extras = [...new Set(menu.categories.filter((c) => c.kind === "EXTRAS").flatMap((c) => c.productIds))]
    .map((id) => byId.get(id)!)
    .filter((p) => p && p.active && !p.outOfStock && p.variants.length === 0 && !p.optionGroups.some((g) => g.minSelect > 0))
    .map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, image: p.image?.src ?? null, modes: { PICKUP: p.availablePickup, DELIVERY: p.availableDelivery, DINE_IN: p.availableDineIn } }));
  return (
    <Checkout restaurant={publicRestaurant} account={account} extras={extras} askExtras={config.extras.askAtCheckout}
      country={config.region.country}
      options={{ requireEmail: config.orders.requireEmail, allowNotes: config.orders.allowNotes, accountsEnabled: config.customers.accountsEnabled, notesPlaceholder: config.site.notesPlaceholder }} />
  );
}
