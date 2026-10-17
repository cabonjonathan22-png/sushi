import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/order/Checkout";
import { getCustomer } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { getPublicRestaurant } from "@/lib/restaurants";

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
  return (
    <Checkout restaurant={publicRestaurant} account={account}
      country={config.region.country}
      options={{ requireEmail: config.orders.requireEmail, allowNotes: config.orders.allowNotes, accountsEnabled: config.customers.accountsEnabled, notesPlaceholder: config.site.notesPlaceholder }} />
  );
}
