import Link from "next/link";
import { adminContext } from "@/lib/admin";
import { verifyAuditChain } from "@/lib/audit";
import { db } from "@/lib/db";
import { restaurantScope } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Journal des actions" };

const LABELS: Record<string, string> = {
  "auth.login": "Connexion", "auth.failed": "Échec de connexion", "auth.2fa_enabled": "2FA activée", "auth.2fa_failed": "Code 2FA erroné",
  "auth.password_changed": "Mot de passe changé", "order.create": "Commande passée", "order.status": "Statut de commande", "order.payment": "Règlement noté",
  "order.refund": "Remboursement / avoir", "product.out_of_stock": "Rupture", "product.back_in_stock": "Retour en stock", "product.update": "Produit modifié",
  "product.create": "Produit créé", "product.archive": "Produit archivé", "restaurant.pause": "Commandes fermées", "restaurant.resume": "Commandes rouvertes",
  "restaurant.hours": "Horaires modifiés", "zone.update": "Zone modifiée", "zone.create": "Zone créée", "user.create": "Compte créé", "user.update": "Compte modifié",
  "closure.daily": "Clôture journalière", "restaurant.stripe": "Clés Stripe", "promo.create": "Code promo créé", "promo.update": "Code promo modifié",
};

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ q?: string; verifier?: string; avant?: string }> }) {
  const { staff, restaurants } = await adminContext("audit.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const before = Number(sp.avant) || undefined;
  const scoped = Object.keys(restaurantScope(staff.actor)).length > 0;
  const entries = await db.auditLog.findMany({
    where: {
      ...(before ? { seq: { lt: before } } : {}),
      ...(scoped ? { OR: [{ restaurantId: { in: restaurants.map((r) => r.id) } }, { restaurantId: null }] } : {}),
      ...(q ? { OR: [{ action: { contains: q } }, { actor: { contains: q, mode: "insensitive" } }, { entityId: q }] } : {}),
    },
    orderBy: { seq: "desc" },
    take: 100,
  });
  const broken = sp.verifier ? await verifyAuditChain() : undefined;
  const names = new Map(restaurants.map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-5xl">Journal des actions</h1>
      <p className="text-neutral-700">Chaque action est horodatée et chaînée à la précédente par une empreinte : toute modification a posteriori serait détectée.</p>
      <div className="flex flex-wrap gap-3">
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Action, personne, n°…" className="input" /><button className="btn-dark">Rechercher</button></form>
        <Link href="?verifier=1" className="btn-ghost">Vérifier l'intégrité</Link>
      </div>
      {broken !== undefined && (
        <p className={`rounded-xl p-3 font-semibold ${broken === null ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {broken === null ? "✓ Journal intact : aucune entrée modifiée ou supprimée." : `⚠ Chaîne rompue à l'entrée n° ${broken}.`}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600"><tr><th className="p-3">N°</th><th className="p-3">Date</th><th className="p-3">Qui</th><th className="p-3">Action</th><th className="p-3">Restaurant</th><th className="p-3">Détail</th></tr></thead>
          <tbody className="divide-y">
            {entries.map((e) => (
              <tr key={e.seq} className="align-top">
                <td className="p-3 text-neutral-500">{e.seq}</td>
                <td className="whitespace-nowrap p-3">{formatDateTime(e.at)}</td>
                <td className="p-3">{e.actor}{e.ip && <span className="block text-xs text-neutral-500">{e.ip}</span>}</td>
                <td className="p-3 font-semibold">{LABELS[e.action] ?? e.action}</td>
                <td className="p-3">{e.restaurantId ? names.get(e.restaurantId) ?? "—" : "—"}</td>
                <td className="max-w-md p-3"><code className="line-clamp-3 break-all text-xs text-neutral-700">{JSON.stringify(e.data)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length === 100 && <Link href={`?${new URLSearchParams({ ...(q ? { q } : {}), avant: String(entries.at(-1)!.seq) })}`} className="btn-ghost">Plus ancien →</Link>}
    </div>
  );
}
