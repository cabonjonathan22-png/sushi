import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { adjustPointsAction, deleteRewardAction, saveLoyaltySettingsAction, saveRewardAction, toggleRewardAction } from "./actions";

export const metadata = { title: "Fidélité" };

const KIND: Record<string, string> = {
  EARN: "Commande", REDEEM: "Récompense utilisée", REFUND_REDEEM: "Points rendus (annulation)", REVERSE_EARN: "Points retirés (annulation / avoir)",
  BONUS: "Bienvenue", ADJUST: "Correction manuelle", EXPIRE: "Expiration",
};
const TYPE: Record<string, string> = { AMOUNT: "Remise en €", PERCENT: "Remise en %", FREE_PRODUCT: "Produit offert" };

type SP = { recompense?: string; q?: string; client?: string };

/** Carte de fidélité : réglages, récompenses, suivi des clients. */
export default async function LoyaltyAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  await adminContext("promos.edit");
  const sp = await searchParams;
  const config = await getConfig();
  const s = config.loyalty;
  const since = new Date(Date.now() - 30 * 86400_000);

  const [rewards, products, totals, members, last30, editing] = await Promise.all([
    db.loyaltyReward.findMany({ orderBy: [{ active: "desc" }, { pointsCost: "asc" }], include: { product: { select: { name: true } }, _count: { select: { transactions: { where: { kind: "REDEEM" } } } } } }),
    db.product.findMany({ where: { archived: false, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, priceCents: true } }),
    db.loyaltyTransaction.aggregate({ _sum: { points: true } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (SELECT "customerId" FROM "LoyaltyTransaction" GROUP BY "customerId" HAVING SUM(points) > 0) t`,
    db.loyaltyTransaction.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _sum: { points: true }, _count: true }),
    sp.recompense && sp.recompense !== "nouvelle" ? db.loyaltyReward.findUnique({ where: { id: sp.recompense } }) : null,
  ]);
  const stat = (k: string) => last30.find((x) => x.kind === k);
  const showForm = sp.recompense === "nouvelle" || !!editing;

  // Recherche de clients et fiche client
  const q = (sp.q ?? "").trim();
  const found = q ? await db.customer.findMany({
    where: { anonymizedAt: null, OR: [{ email: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\s/g, "") } }] },
    take: 20, orderBy: { createdAt: "desc" }, select: { id: true, firstName: true, lastName: true, email: true },
  }) : [];
  const balances = found.length ? await db.loyaltyTransaction.groupBy({ by: ["customerId"], where: { customerId: { in: found.map((c) => c.id) } }, _sum: { points: true } }) : [];
  const client = sp.client ? await db.customer.findUnique({ where: { id: sp.client }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } }) : null;
  const clientTx = client ? await db.loyaltyTransaction.findMany({ where: { customerId: client.id }, orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { id: true, reference: true } } } }) : [];
  const clientBalance = clientTx.length ? (await db.loyaltyTransaction.aggregate({ where: { customerId: client!.id }, _sum: { points: true } }))._sum.points ?? 0 : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="me-auto text-5xl">Fidélité</h1>
        <span className={`chip px-3 py-1 text-sm ${s.enabled ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700"}`}>{s.enabled ? "Carte active sur le site" : "Carte désactivée"}</span>
        {s.enabled && <Link href="/fidelite" target="_blank" className="btn-ghost">Voir la page client</Link>}
      </div>
      <p className="text-neutral-700">
        Les clients connectés gagnent des points à chaque commande remise, puis les échangent au moment de commander contre une récompense.
        Les remises de fidélité figurent en comptabilité comme des remises commerciales. {!config.customers.accountsEnabled && <strong className="text-red-700">Les comptes clients sont désactivés (Configuration) : la carte n'est pas proposée.</strong>}
      </p>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Clients avec des points", String(Number(members[0]?.n ?? 0))],
          ["Points en circulation", String(totals._sum.points ?? 0)],
          ["Points gagnés (30 j)", String(stat("EARN")?._sum.points ?? 0)],
          ["Récompenses utilisées (30 j)", String(stat("REDEEM")?._count ?? 0)],
        ].map(([l, v]) => <div key={l} className="card p-4"><p className="text-sm font-semibold text-neutral-600">{l}</p><p className="font-display text-4xl">{v}</p></div>)}
      </div>

      <section className="card p-5">
        <h2 className="text-3xl">Réglages</h2>
        <ActionForm action={saveLoyaltySettingsAction} className="mt-3 grid gap-4 sm:grid-cols-4 sm:items-end">
          <label className="flex items-center gap-2 font-semibold sm:col-span-4"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-5 w-5" />Proposer la carte de fidélité sur le site</label>
          <div><label className="label" htmlFor="ppe">Points gagnés par euro payé</label><input id="ppe" name="pointsPerEuro" type="number" min={1} max={100} defaultValue={s.pointsPerEuro} className="input" />
            <p className="mt-1 text-xs text-neutral-600">Hors frais de livraison, après remises.</p></div>
          <div><label className="label" htmlFor="exp">Expiration après inactivité (mois)</label><input id="exp" name="expiryMonths" type="number" min={0} max={60} defaultValue={s.expiryMonths} className="input" />
            <p className="mt-1 text-xs text-neutral-600">0 = les points n'expirent jamais.</p></div>
          <div><label className="label" htmlFor="bon">Points de bienvenue</label><input id="bon" name="signupBonus" type="number" min={0} max={10000} defaultValue={s.signupBonus} className="input" />
            <p className="mt-1 text-xs text-neutral-600">Offerts à la création du compte.</p></div>
          <SubmitButton className="btn-primary">Enregistrer</SubmitButton>
        </ActionForm>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="me-auto text-3xl">Récompenses</h2>
          {!showForm && <Link href="?recompense=nouvelle#form" className="btn-primary">+ Récompense</Link>}
        </div>
        {rewards.length === 0 && <p className="mt-3 text-neutral-600">Aucune récompense : créez-en au moins une pour que les clients puissent utiliser leurs points.</p>}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-neutral-600"><tr><th className="py-2">Récompense</th><th className="py-2">Type</th><th className="py-2 text-right">Coût</th><th className="py-2 text-right">Dès</th><th className="py-2 text-right">Utilisée</th><th className="py-2" /></tr></thead>
            <tbody className="divide-y">
              {rewards.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-55"}>
                  <td className="py-2"><strong>{r.name}</strong>{r.description && <span className="block text-neutral-600">{r.description}</span>}</td>
                  <td className="py-2">{TYPE[r.type]} — {r.type === "AMOUNT" ? euros(r.value) : r.type === "PERCENT" ? `${r.value} %` : r.product?.name ?? "produit supprimé"}</td>
                  <td className="py-2 text-right font-semibold">{r.pointsCost} pts</td>
                  <td className="py-2 text-right">{r.minSubtotalCents ? euros(r.minSubtotalCents) : "—"}</td>
                  <td className="py-2 text-right">{r._count.transactions} fois</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <form action={toggleRewardAction}><input type="hidden" name="id" value={r.id} /><button className={`chip px-3 py-1 ${r.active ? "bg-green-600 text-white" : "bg-neutral-300"}`}>{r.active ? "Active" : "Inactive"}</button></form>
                      <Link href={`?recompense=${r.id}#form`} className="text-sm font-semibold underline">Modifier</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div id="form" className="mt-5 rounded-2xl border border-neutral-200 p-4">
            <h3 className="text-2xl">{editing ? `Modifier « ${editing.name} »` : "Nouvelle récompense"}</h3>
            <ActionForm action={saveRewardAction} className="mt-3 grid gap-4 sm:grid-cols-2">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div><label className="label" htmlFor="rn">Nom affiché aux clients</label><input id="rn" name="name" required maxLength={80} defaultValue={editing?.name} placeholder="5 € offerts" className="input" /></div>
              <div><label className="label" htmlFor="rc">Coût en points</label><input id="rc" name="pointsCost" type="number" min={1} required defaultValue={editing?.pointsCost ?? 100} className="input" /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="rd">Description (facultative)</label><input id="rd" name="description" maxLength={300} defaultValue={editing?.description} className="input" /></div>
              <fieldset className="sm:col-span-2">
                <legend className="label">Type de récompense</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="rounded-xl border border-neutral-200 p-3"><span className="flex items-center gap-2 font-semibold"><input type="radio" name="type" value="AMOUNT" defaultChecked={!editing || editing.type === "AMOUNT"} />Remise en €</span>
                    <input name="amount" defaultValue={editing?.type === "AMOUNT" ? (editing.value / 100).toFixed(2).replace(".", ",") : "5,00"} className="input mt-2" aria-label="Montant de la remise (€)" /></label>
                  <label className="rounded-xl border border-neutral-200 p-3"><span className="flex items-center gap-2 font-semibold"><input type="radio" name="type" value="PERCENT" defaultChecked={editing?.type === "PERCENT"} />Remise en %</span>
                    <input name="percent" type="number" min={1} max={100} defaultValue={editing?.type === "PERCENT" ? editing.value : 10} className="input mt-2" aria-label="Pourcentage de remise" /></label>
                  <label className="rounded-xl border border-neutral-200 p-3"><span className="flex items-center gap-2 font-semibold"><input type="radio" name="type" value="FREE_PRODUCT" defaultChecked={editing?.type === "FREE_PRODUCT"} />Produit offert</span>
                    <select name="productId" defaultValue={editing?.productId ?? ""} className="input mt-2" aria-label="Produit offert">
                      <option value="">— choisir —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({euros(p.priceCents)})</option>)}
                    </select></label>
                </div>
                <p className="mt-2 text-xs text-neutral-600">Produit offert : il est ajouté automatiquement à la commande (une unité), son prix est déduit. Les produits à choix obligatoire ne peuvent pas être offerts.</p>
              </fieldset>
              <div><label className="label" htmlFor="rm">Commande minimum (€, facultatif)</label><input id="rm" name="minSubtotal" defaultValue={editing ? (editing.minSubtotalCents / 100).toFixed(2).replace(".", ",") : "0"} className="input" /></div>
              <div><label className="label" htmlFor="ro">Ordre d'affichage</label><input id="ro" name="sortOrder" type="number" min={0} defaultValue={editing?.sortOrder ?? 0} className="input" /></div>
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} className="h-5 w-5" />Proposée aux clients</label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <SubmitButton className="btn-primary">{editing ? "Enregistrer" : "Créer la récompense"}</SubmitButton>
                <Link href="/admin/fidelite" className="btn-ghost">Fermer</Link>
              </div>
            </ActionForm>
            {editing && (
              <form action={deleteRewardAction} className="mt-3"><input type="hidden" name="id" value={editing.id} /><button className="text-sm text-red-700 underline">Supprimer cette récompense (l'historique des clients est conservé)</button></form>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-3xl">Clients</h2>
        <form className="mt-3 flex flex-wrap gap-2" action="/admin/fidelite">
          <label className="sr-only" htmlFor="cq">Rechercher un client</label>
          <input id="cq" name="q" defaultValue={q} placeholder="Nom, e-mail ou téléphone" className="input max-w-md" />
          <button className="btn-dark">Rechercher</button>
        </form>
        {q && (
          <ul className="mt-3 divide-y text-sm">
            {found.length === 0 && <li className="py-2 text-neutral-600">Aucun client trouvé.</li>}
            {found.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span><strong>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</strong> <span className="text-neutral-600">{c.email}</span></span>
                <span className="flex items-center gap-3"><strong>{balances.find((b) => b.customerId === c.id)?._sum.points ?? 0} pts</strong><Link href={`?q=${encodeURIComponent(q)}&client=${c.id}#client`} className="underline">Ouvrir</Link></span>
              </li>
            ))}
          </ul>
        )}
        {client && (
          <div id="client" className="mt-5 rounded-2xl border border-neutral-200 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <h3 className="me-auto text-2xl">{[client.firstName, client.lastName].filter(Boolean).join(" ") || client.email}</h3>
              <p className="font-display text-4xl">{clientBalance} pts</p>
            </div>
            <p className="text-sm text-neutral-600">{client.email} {client.phone && `· ${client.phone}`}</p>
            <ActionForm action={adjustPointsAction} className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
              <input type="hidden" name="customerId" value={client.id} />
              <div><label className="label" htmlFor="ap">Points (+ / −)</label><input id="ap" name="points" type="number" required placeholder="+20" className="input" /></div>
              <div><label className="label" htmlFor="an">Motif (visible par le client)</label><input id="an" name="note" required maxLength={200} placeholder="Geste commercial" className="input" /></div>
              <SubmitButton className="btn-dark">Ajuster</SubmitButton>
            </ActionForm>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-neutral-600"><tr><th className="py-2">Date</th><th className="py-2">Mouvement</th><th className="py-2">Détail</th><th className="py-2 text-right">Points</th></tr></thead>
              <tbody className="divide-y">
                {clientTx.length === 0 && <tr><td colSpan={4} className="py-3 text-neutral-600">Aucun mouvement.</td></tr>}
                {clientTx.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2">{formatDateTime(tx.createdAt)}</td>
                    <td className="py-2">{KIND[tx.kind]}</td>
                    <td className="py-2">{tx.order ? <Link href={`/admin/commandes/${tx.order.id}`} className="underline">{tx.order.reference}</Link> : tx.note}</td>
                    <td className={`py-2 text-right font-semibold ${tx.points > 0 ? "text-green-700" : ""}`}>{tx.points > 0 ? "+" : ""}{tx.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
