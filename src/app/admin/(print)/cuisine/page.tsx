import type { Metadata } from "next";
import { KitchenScreen } from "@/components/admin/KitchenScreen";
import { adminRestaurant } from "@/lib/admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Écran cuisine", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Écran cuisine plein écran (sans menu latéral), pour une tablette ou un écran au mur. */
export default async function KitchenPage() {
  const { staff, current } = await adminRestaurant("orders.view");
  return <KitchenScreen restaurantId={current.id} restaurantName={current.name} canUpdate={can(staff.actor, "orders.update", current.id)} />;
}
