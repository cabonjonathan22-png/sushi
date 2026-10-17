import Link from "next/link";
import { adminContext } from "@/lib/admin";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";

export const metadata = { title: "Produits archivés" };

export default async function Archives() {
  await adminContext("menu.edit");
  const products = await db.product.findMany({ where: { archived: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/menu" className="text-sm font-semibold underline">← Menu</Link>
      <h1 className="text-5xl">Produits archivés</h1>
      <ul className="card divide-y">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3">
            <span>{p.name} · {euros(p.priceCents)}</span>
            <Link href={`/admin/menu/produits/${p.id}`} className="btn-ghost min-h-10">Ouvrir</Link>
          </li>
        ))}
        {products.length === 0 && <li className="p-4 text-neutral-500">Aucun.</li>}
      </ul>
    </div>
  );
}
