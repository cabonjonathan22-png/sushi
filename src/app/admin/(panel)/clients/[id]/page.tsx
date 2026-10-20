import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext } from "@/lib/admin";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { getConfig } from "@/lib/config";
import { getSiteSettings } from "@/lib/restaurants";
import { loadClient } from "@/lib/customers-admin";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { adjustPointsAction } from "../../fidelite/actions";
import { KIND_LABEL } from "../labels";

export const metadata = { title: "Fiche client" };

const LOYALTY_KIND: Record<string, string> = {
  EARN: "Commande", REDEEM: "Récompense utilisée", REFUND_REDEEM: "Points rendus (annulation)", REVERSE_EARN: "Points retirés (annulation / avoir)",
  BONUS: "Bienvenue", ADJUST: "Correction manuelle", EXPIRE: "Expiration",
};

/** Fiche client : coordonnées, statistiques, plats préférés, fidélité, adresses, commandes. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await adminContext("customers.view");
  const client = await loadClient((await params).id);
  if (!client) notFound();
  const config = await getConfig();

  const counted = client.orders.filter((o) => o.status !== "CANCELLED" && o.status !== "PENDING_PAYMENT");
  const spent = counted.reduce((a, o) => a + o.totalCents, 0);
  // Plats préférés : hors « petits plus » (sauces, baguettes…), qui fausseraient le classement.
  const { extrasLabel } = await getSiteSettings();
  const favorites = [...counted.flatMap((o) => o.lines).filter((l) => l.categoryName !== extrasLabel).reduce((m, l) => m.set(l.name, (m.get(l.name) ?? 0) + l.quantity), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const modes = Object.entries(counted.reduce((m, o) => ({ ...m, [o.mode]: (m[o.mode] ?? 0) + 1 }), {} as Record<string, number>));
  const loyalty = client.customer && config.loyalty.enabled
    ? await db.loyaltyTransaction.findMany({ where: { customerId: client.customer.id }, orderBy: { createdAt: "desc" }, take: 30, include: { order: { select: { id: true, reference: true } } } })
    : null;
  const balance = loyalty ? (await db.loyaltyTransaction.aggregate({ where: { customerId: client.customer!.id }, _sum: { points: true } }))._sum.points ?? 0 : 0;
  const canAdjust = staff.actor.role !== "EMPLOYEE";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin/clients" className="text-sm font-semibold underline">← Clients</Link>
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="me-auto text-5xl">{client.name || "(sans nom)"}</h1>
        <span className={`chip px-3 py-1 text-sm ${KIND_LABEL[client.kind].cls}`}>{KIND_LABEL[client.kind].label}</span>
      </div>
      <p className="text-neutral-700">
        {client.email && <a href={`mailto:${client.email}`} className="underline">{client.email}</a>}
        {client.phone && <> · <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="underline">{client.phone}</a></>}
        {client.customer && <> · compte créé le {formatDateTime(client.customer.createdAt).slice(0, 10)}</>}
      </p>
      {client.kind === "TO_ACTIVATE" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Compte repris de l'ancien site, pas encore activé : le client peut l'activer sur le site avec « Créer mon compte / mot de passe oublié » et son e-mail. Il retrouvera alors son historique.</p>
      )}
      {client.kind === "GUEST" && (
        <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-700">Ce client commande sans compte. S'il crée un compte avec cet e-mail, ses commandes y seront rattachées automatiquement.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Commandes", String(counted.length)],
          ["Total dépensé", euros(spent)],
          ["Panier moyen", euros(counted.length ? Math.round(spent / counted.length) : 0)],
          ["Dernière commande", client.orders[0] ? formatDateTime(client.orders[0].placedAt) : "—"],
        ].map(([l, v]) => <div key={l} className="card p-4"><p className="text-sm font-semibold text-neutral-600">{l}</p><p className="font-display text-3xl">{v}</p></div>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-3xl">Plats préférés</h2>
          {favorites.length === 0 ? <p className="mt-2 text-neutral-600">Aucune commande.</p> : (
            <ul className="mt-3 space-y-1">{favorites.map(([name, qty]) => <li key={name} className="flex justify-between gap-3"><span>{name}</span><strong>× {qty}</strong></li>)}</ul>
          )}
          {modes.length > 0 && <p className="mt-4 text-sm text-neutral-600">{modes.map(([m, n]) => `${MODE_LABELS[m as keyof typeof MODE_LABELS]} : ${n}`).join(" · ")}</p>}
        </section>

        {loyalty && (
          <section className="card p-5">
            <div className="flex items-end justify-between gap-3"><h2 className="text-3xl">Fidélité</h2><p className="font-display text-4xl">{balance} pts</p></div>
            <p className="mt-2 flex flex-wrap gap-3 text-sm">
              {client.customer!.cardNumber && <span>Carte n° <strong className="font-mono">{client.customer!.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}</strong></span>}
              <a href={`/admin/fidelite/imprimer/${client.customer!.id}?auto=1`} target="_blank" className="underline">Imprimer la carte</a>
              <a href={`/admin/fidelite/imprimer/${client.customer!.id}?format=ticket&auto=1`} target="_blank" className="underline">sur ticket 80 mm</a>
            </p>
            {canAdjust && (
              <ActionForm action={adjustPointsAction} className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-end">
                <input type="hidden" name="customerId" value={client.customer!.id} />
                <div><label className="label" htmlFor="ap">Points (+ / −)</label><input id="ap" name="points" type="number" required placeholder="+20" className="input" /></div>
                <div><label className="label" htmlFor="an">Motif (visible par le client)</label><input id="an" name="note" required maxLength={200} placeholder="Geste commercial" className="input" /></div>
                <SubmitButton className="btn-dark">Ajuster</SubmitButton>
              </ActionForm>
            )}
            <ul className="mt-3 max-h-64 divide-y overflow-y-auto text-sm">
              {loyalty.length === 0 && <li className="py-2 text-neutral-600">Aucun mouvement.</li>}
              {loyalty.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-1.5">
                  <span>{LOYALTY_KIND[t.kind]} · {t.order ? <Link href={`/admin/commandes/${t.order.id}`} className="underline">{t.order.reference}</Link> : t.note}<span className="block text-xs text-neutral-500">{formatDateTime(t.createdAt)}</span></span>
                  <strong className={t.points > 0 ? "text-green-700" : ""}>{t.points > 0 ? "+" : ""}{t.points}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {client.customer && client.customer.addresses.length > 0 && (
          <section className="card p-5">
            <h2 className="text-3xl">Adresses</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {client.customer.addresses.map((a) => <li key={a.id}>{a.street}{a.extra && `, ${a.extra}`}, {a.postalCode} {a.city}{a.notes && <span className="block text-neutral-500">{a.notes}</span>}</li>)}
            </ul>
          </section>
        )}
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="text-3xl">Commandes ({client.orders.length})</h2>
        <table className="mt-3 w-full min-w-[760px] text-left text-sm">
          <thead className="text-neutral-600"><tr><th className="py-2">Commande</th><th className="py-2">Date</th><th className="py-2">Restaurant</th><th className="py-2">Mode</th><th className="py-2">Statut</th><th className="py-2">Paiement</th><th className="py-2">Plats</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody className="divide-y">
            {client.orders.map((o) => (
              <tr key={o.id}>
                <td className="py-2"><Link href={`/admin/commandes/${o.id}`} className="font-semibold underline">{o.reference}</Link>{o.source === "IMPORT_WP" && <span className="chip ms-2 bg-neutral-200 text-neutral-700">Ancien site</span>}</td>
                <td className="py-2">{formatDateTime(o.placedAt)}</td>
                <td className="py-2">{o.restaurant.name}</td>
                <td className="py-2">{MODE_LABELS[o.mode]}</td>
                <td className="py-2">{STATUS_LABELS[o.status]}</td>
                <td className="py-2">{PAYMENT_METHOD_LABELS[o.paymentMethod]}</td>
                <td className="max-w-[260px] truncate py-2" title={o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}>{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</td>
                <td className="py-2 text-right font-semibold">{euros(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
