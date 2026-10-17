import Link from "next/link";
import { MenuManager, type AdminMenuCategory } from "@/components/admin/MenuManager";
import { adminRestaurant } from "@/lib/admin";
import { db } from "@/lib/db";
import { imageSources, type ImageFiles } from "@/lib/images";
import { can } from "@/lib/permissions";

export const metadata = { title: "Menu & ruptures" };

export default async function MenuPage() {
  const { staff, current } = await adminRestaurant("stock.toggle");
  const [categories, overrides, vOverrides, images, catOverrides] = await Promise.all([
    db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        products: {
          orderBy: { sortOrder: "asc" },
          where: { product: { archived: false } },
          include: { product: { include: { variants: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
    }),
    db.restaurantProduct.findMany({ where: { restaurantId: current.id } }),
    db.restaurantVariant.findMany({ where: { restaurantId: current.id } }),
    db.image.findMany({ select: { id: true, files: true } }),
    db.restaurantCategory.findMany({ where: { restaurantId: current.id } }),
  ]);
  const catHidden = new Set(catOverrides.filter((c) => !c.visible).map((c) => c.categoryId));
  const ovr = new Map(overrides.map((o) => [o.productId, o]));
  const vOvr = new Map(vOverrides.map((o) => [o.variantId, o]));
  const img = new Map(images.map((i) => [i.id, imageSources(i.files as ImageFiles, 160)?.src ?? null]));

  const data: AdminMenuCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    visible: c.visible,
    restaurantVisible: !catHidden.has(c.id),
    kind: c.kind,
    products: c.products.map(({ product: p }) => ({
      id: p.id,
      name: p.name,
      priceCents: ovr.get(p.id)?.priceCents ?? p.priceCents,
      image: p.imageId ? img.get(p.imageId) ?? null : null,
      active: p.active,
      restaurantActive: ovr.get(p.id)?.active ?? true,
      outOfStock: ovr.get(p.id)?.outOfStock ?? false,
      variants: p.variants.map((v) => ({ id: v.id, label: v.label, outOfStock: vOvr.get(v.id)?.outOfStock ?? false })),
    })),
  }));
  const canEdit = can(staff.actor, "menu.edit", current.id);
  const archived = canEdit ? await db.product.count({ where: { archived: true } }) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-5xl">Menu & ruptures</h1>
        {canEdit && <Link href="/admin/menu/produits/nouveau" className="btn-primary">+ Produit</Link>}
        {canEdit && <Link href="/admin/menu/categories/nouvelle" className="btn-ghost">+ Catégorie</Link>}
      </div>
      <p className="text-neutral-700">
        Touchez <strong>Disponible</strong> pour passer un produit en <strong>rupture</strong> à {current.name} (il apparaît grisé sur le site).
        {" "}<strong>Au menu / Retiré</strong> et <strong>Affichée ici / Masquée ici</strong> règlent ce que propose ce restaurant uniquement.
        {canEdit && " Glissez ⠿ pour changer l'ordre."}
      </p>
      <MenuManager restaurantId={current.id} initial={data} canEdit={canEdit} canRestaurant={can(staff.actor, "menu.restaurant", current.id)} />
      {archived > 0 && <Link href="/admin/menu/archives" className="text-sm underline">{archived} produit(s) archivé(s)</Link>}
    </div>
  );
}
