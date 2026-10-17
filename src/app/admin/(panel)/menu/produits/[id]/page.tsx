import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { ProductEditor, type ProductFormData } from "@/components/admin/ProductEditor";
import { adminContext } from "@/lib/admin";
import { db } from "@/lib/db";
import { imageSources, type ImageFiles } from "@/lib/images";
import { getConfig } from "@/lib/config";
import { can } from "@/lib/permissions";
import { archiveProductAction, saveOverrideAction } from "../../actions";

export const metadata = { title: "Produit" };

const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { staff, restaurants } = await adminContext("menu.edit");
  const isNew = id === "nouveau";
  const [categories, product] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    isNew ? null : db.product.findUnique({
      where: { id },
      include: {
        categories: true,
        variants: { orderBy: { sortOrder: "asc" } },
        optionGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
        overrides: true,
      },
    }),
  ]);
  if (!isNew && !product) notFound();
  const image = product?.imageId ? await db.image.findUnique({ where: { id: product.imageId } }) : null;

  const initial: ProductFormData = product
    ? {
        id: product.id,
        name: product.name,
        shortDescription: product.shortDescription,
        description: product.description,
        price: fmt(product.priceCents),
        vatRate: product.vatRate,
        categoryIds: product.categories.map((c) => c.categoryId),
        allergens: product.allergens,
        badges: product.badges,
        isAlcohol: product.isAlcohol,
        maxQuantity: product.maxQuantity ? String(product.maxQuantity) : "",
        includedExtras: String(product.includedExtras),
        availablePickup: product.availablePickup,
        availableDelivery: product.availableDelivery,
        availableDineIn: product.availableDineIn,
        availableLunch: product.availableLunch,
        availableDinner: product.availableDinner,
        active: product.active,
        image: imageSources(image?.files as ImageFiles | undefined, 640)?.src ?? null,
        variants: product.variants.map((v) => ({ id: v.id, label: v.label, price: fmt(v.priceCents), active: v.active })),
        groups: product.optionGroups.map((g) => ({
          id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, price: fmt(o.priceDeltaCents), active: o.active })),
        })),
      }
    : {
        name: "", shortDescription: "", description: "", price: "", vatRate: 1000, categoryIds: [], allergens: [], badges: [],
        isAlcohol: false, maxQuantity: "", includedExtras: "0", availablePickup: true, availableDelivery: true, availableDineIn: true, availableLunch: true, availableDinner: true, active: true,
        image: null, variants: [], groups: [],
      };

  const ok = (await searchParams).ok;
  const editableRestaurants = restaurants.filter((r) => can(staff.actor, "menu.restaurant", r.id));
  const config = await getConfig();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin/menu" className="text-sm font-semibold underline">← Menu</Link>
      <h1 className="text-5xl">{isNew ? "Nouveau produit" : product!.name}</h1>
      {ok && <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">Produit créé.</p>}
      <ProductEditor initial={initial} categories={categories} badges={config.catalog.badges} vatRates={config.catalog.vatRates}
        restaurants={editableRestaurants.map((r) => ({ id: r.id, name: r.name, enabled: product ? (product.overrides.find((o) => o.restaurantId === r.id)?.active ?? true) : true }))} />

      {product && editableRestaurants.length > 0 && (
        <section className="card p-5">
          <h2 className="text-3xl">Prix par restaurant</h2>
          <p className="text-sm text-neutral-600">Laisser vide pour utiliser le prix du catalogue ({fmt(product.priceCents)} €).</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {editableRestaurants.map((r) => {
              const o = product.overrides.find((x) => x.restaurantId === r.id);
              return (
                <ActionForm key={r.id} action={saveOverrideAction} className="flex items-end gap-2">
                  <input type="hidden" name="restaurantId" value={r.id} />
                  <input type="hidden" name="productId" value={product.id} />
                  <div className="flex-1">
                    <label className="label" htmlFor={`p-${r.id}`}>{r.name}</label>
                    <input id={`p-${r.id}`} name="price" inputMode="decimal" defaultValue={o?.priceCents != null ? fmt(o.priceCents) : ""} placeholder={fmt(product.priceCents)} className="input" />
                  </div>
                  <SubmitButton className="btn-ghost">OK</SubmitButton>
                </ActionForm>
              );
            })}
          </div>
        </section>
      )}

      {product && (
        <form action={archiveProductAction} className="card flex flex-wrap items-center gap-3 p-5">
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="value" value={product.archived ? "0" : "1"} />
          <p className="flex-1 text-sm text-neutral-700">
            {product.archived ? "Ce produit est archivé (absent du menu et du back-office)." : "Archiver retire le produit du menu. Les commandes passées restent intactes."}
          </p>
          <SubmitButton className={product.archived ? "btn-ghost" : "btn-danger"}>{product.archived ? "Désarchiver" : "Archiver le produit"}</SubmitButton>
        </form>
      )}
    </div>
  );
}
