import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext } from "@/lib/admin";
import { db } from "@/lib/db";
import { deleteCategoryAction, saveCategoryAction } from "../../actions";

export const metadata = { title: "Catégorie" };

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await adminContext("menu.edit");
  const { id } = await params;
  const isNew = id === "nouvelle";
  const c = isNew ? null : await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!isNew && !c) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/admin/menu" className="text-sm font-semibold underline">← Menu</Link>
      <h1 className="text-5xl">{isNew ? "Nouvelle catégorie" : c!.name}</h1>
      <ActionForm action={saveCategoryAction} className="card grid gap-4 p-5">
        <input type="hidden" name="id" value={c?.id ?? ""} />
        <div><label className="label" htmlFor="name">Nom</label><input id="name" name="name" required maxLength={60} defaultValue={c?.name} className="input" /></div>
        <div><label className="label" htmlFor="desc">Description (facultative)</label><textarea id="desc" name="description" maxLength={300} defaultValue={c?.description} className="input" /></div>
        <label className="flex items-center gap-2"><input type="checkbox" name="visible" defaultChecked={c?.visible ?? true} className="h-5 w-5" />Visible sur le site</label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="kind" value="EXTRAS" defaultChecked={c?.kind === "EXTRAS"} className="mt-1 h-5 w-5" />
          <span>Catégorie « petits plus » : ses produits (sauces, wasabi, baguettes…) sont proposés dans le panier avant la validation.</span>
        </label>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>
      {c && c._count.products === 0 && (
        <form action={deleteCategoryAction}>
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton className="btn-danger">Supprimer la catégorie (vide)</SubmitButton>
        </form>
      )}
    </div>
  );
}
