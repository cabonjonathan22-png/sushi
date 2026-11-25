import type { Metadata } from "next";
import { PosScreen, type PosProduct } from "@/components/admin/PosScreen";
import { adminRestaurant } from "@/lib/admin";
import { db } from "@/lib/db";
import { loadMenu } from "@/lib/menu";
import { can } from "@/lib/permissions";
import { RECEIPT_METHODS } from "@/lib/pos";

export const metadata: Metadata = { title: "Caisse", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Caisse tactile plein écran : vente au comptoir + commandes du site en direct. */
export default async function PosPage() {
  const { staff, current } = await adminRestaurant("pos.sell");
  const [menu, printers, restaurant] = await Promise.all([
    loadMenu(current.id),
    db.printer.findMany({ where: { restaurantId: current.id, active: true, method: { in: [...RECEIPT_METHODS] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.restaurant.findUniqueOrThrow({ where: { id: current.id }, select: { dineInEnabled: true, pickupEnabled: true } }),
  ]);
  const products: PosProduct[] = menu.products
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id, name: p.name, priceCents: p.priceCents, fromPriceCents: p.fromPriceCents, outOfStock: p.outOfStock,
      image: p.image?.src ?? null, isExtra: !!p.isExtra, categoryIds: p.categoryIds,
      variants: p.variants.filter((v) => v.active).map((v) => ({ id: v.id, label: v.label, priceCents: v.priceCents, outOfStock: v.outOfStock })),
      optionGroups: p.optionGroups.map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options: g.options.filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents })) })),
    }));
  const categories = menu.categories
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind, productIds: c.productIds.filter((id) => products.some((p) => p.id === id)) }))
    .filter((c) => c.productIds.length);
  return (
    <PosScreen
      restaurantId={current.id}
      restaurantName={current.name}
      seller={staff.label}
      categories={categories}
      products={products}
      printers={printers}
      modes={{ dineIn: restaurant.dineInEnabled, pickup: restaurant.pickupEnabled }}
      canRefund={can(staff.actor, "orders.refund", current.id)}
      canUpdate={can(staff.actor, "orders.update", current.id)}
    />
  );
}
