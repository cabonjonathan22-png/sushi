import Link from "next/link";
import { MenuManager, type AdminMenuCategory } from "@/components/admin/MenuManager";
import { adminRestaurant } from "@/lib/admin";
import { db } from "@/lib/db";
import { imageSources, type ImageFiles } from "@/lib/images";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { getConfig } from "@/lib/config";
import { euros } from "@/lib/money";
import { saveExtrasSettingsAction } from "./actions";

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
      {canEdit && <ExtrasSettings />}
    </div>
  );
}

/** Compléments (catégorie de type « petits plus ») : choix obligatoire et compléments offerts. */
async function ExtrasSettings() {
  const { extras } = await getConfig();
  return (
    <details className="card p-5" open={extras.freePerOrder === 0 && extras.tiers.length === 0}>
      <summary className="cursor-pointer font-display text-3xl">Compléments à la commande</summary>
      <p className="mt-2 text-sm text-neutral-700">
        Les compléments sont les produits des catégories de type « petits plus » (sauce soja, baguettes, serviettes, wasabi…).
        À la fin de la commande en ligne, le client les choisit — ou répond « aucun complément », ce qui est imprimé sur le ticket.
        Offerts : les moins chers restent payants, les plus chers sont offerts en premier. Chaque produit peut aussi en inclure (fiche produit, « petits plus offerts »).
      </p>
      <ActionForm action={saveExtrasSettingsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="askAtCheckout" defaultChecked={extras.askAtCheckout} className="h-5 w-5" />Obliger le client à choisir ses compléments (ou « aucun complément ») avant de commander</label>
        <div><label className="label" htmlFor="fpo">Compléments offerts sur toute commande</label><input id="fpo" name="freePerOrder" type="number" min={0} max={20} defaultValue={extras.freePerOrder} className="input" /></div>
        <div>
          <label className="label" htmlFor="tiers">Offerts selon le montant (un palier par ligne : « montant = nombre »)</label>
          <textarea id="tiers" name="tiers" className="input min-h-28 font-mono" placeholder={"25 = 2\n40 = 4"}
            defaultValue={extras.tiers.map((t) => `${(t.fromCents / 100).toString().replace(".", ",")} = ${t.count}`).join("\n")} />
          <p className="mt-1 text-xs text-neutral-600">Ex. « 40 = 4 » : dès 40 € de plats, 4 compléments offerts (s'ajoutent à ceux offerts sur toute commande).</p>
        </div>
        {extras.tiers.length > 0 && <p className="text-sm text-neutral-700 sm:col-span-2">Actuellement : {[extras.freePerOrder ? `${extras.freePerOrder} offert(s) sur toute commande` : "", ...extras.tiers.map((t) => `dès ${euros(t.fromCents)} : +${t.count}`)].filter(Boolean).join(" · ")}</p>}
        <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
      </ActionForm>
    </details>
  );
}
