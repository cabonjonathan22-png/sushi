import Link from "next/link";
import { adminContext } from "@/lib/admin";
import { clientHref, clientStats, listClients, SORTS, type SortKey } from "@/lib/customers-admin";
import { KIND_LABEL } from "./labels";
import { euros } from "@/lib/money";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Clients" };

type SP = { q?: string; type?: string; tri?: string; page?: string };
const PAGE = 50;

/** Tous les clients : comptes, comptes importés à activer, clients ayant commandé sans compte. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await adminContext("customers.view");
  const sp = await searchParams;
  const sort = (sp.tri && sp.tri in SORTS ? sp.tri : "recent") as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const [stats, { total, rows }] = await Promise.all([
    clientStats(),
    listClients({ q: sp.q, kind: sp.type, sort, page, pageSize: PAGE }),
  ]);
  const qs = (over: Partial<SP>) => new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]).toString();
  const tabs: [string, string, number][] = [
    ["", "Tous", stats.total], ["ACCOUNT", "Comptes clients", stats.accounts], ["TO_ACTIVATE", "Comptes à activer", stats.toActivate],
    ["GUEST", "Sans compte", stats.guests], ["LOYAL", "Avec des points", stats.loyal],
  ];
  const sortLink = (key: SortKey, label: string) => (
    <Link href={`?${qs({ tri: key, page: "" })}`} className={sort === key ? "text-ink underline" : "hover:underline"}>{label}{sort === key ? " ↓" : ""}</Link>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="me-auto text-5xl">Clients</h1>
        <a href={`/admin/clients/export?${qs({ page: "" })}`} className="btn-ghost">Exporter la liste (CSV)</a>
      </div>
      <p className="text-neutral-700">
        Toutes les personnes ayant un compte ou ayant déjà commandé. Les commandes passées sans compte sont regroupées par e-mail
        (à défaut par téléphone) et rattachées au compte portant le même e-mail. Les « comptes à activer » viennent de l'ancien site :
        le client les active avec « mot de passe oublié ».
      </p>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Clients", stats.total],
          ["Avec un compte", stats.accounts + stats.toActivate],
          ["Nouveaux ce mois-ci", stats.newThisMonth],
          ["Membres fidélité (avec des points)", stats.loyal],
        ].map(([l, v]) => <div key={String(l)} className="card p-4"><p className="text-sm font-semibold text-neutral-600">{l}</p><p className="font-display text-4xl">{v}</p></div>)}
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([k, l, n]) => (
            <Link key={k} href={`?${qs({ type: k, page: "" })}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${(sp.type ?? "") === k ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>{l} ({n})</Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2" action="/admin/clients">
          {sp.type && <input type="hidden" name="type" value={sp.type} />}
          {sp.tri && <input type="hidden" name="tri" value={sp.tri} />}
          <label htmlFor="cq" className="sr-only">Rechercher</label>
          <input id="cq" name="q" defaultValue={sp.q} placeholder="Nom, e-mail ou téléphone" className="input max-w-md" />
          <button className="btn-dark">Rechercher</button>
          {sp.q && <Link href={`?${qs({ q: "", page: "" })}`} className="btn-ghost">Effacer</Link>}
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="p-3">{sortLink("name", "Client")}</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Type</th>
              <th className="p-3 text-right">{sortLink("orders", "Commandes")}</th>
              <th className="p-3 text-right">{sortLink("spent", "Total dépensé")}</th>
              <th className="p-3">{sortLink("recent", "Dernière commande")}</th>
              <th className="p-3 text-right">{sortLink("points", "Points")}</th>
              <th className="p-3">{sortLink("since", "Client depuis")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((c) => (
              <tr key={c.key} className="hover:bg-brand-50">
                <td className="p-3"><Link href={clientHref(c.key)} className="font-semibold underline">{c.name || "(sans nom)"}</Link></td>
                <td className="p-3">{c.email}<span className="block text-neutral-500">{c.phone}</span></td>
                <td className="p-3"><span className={`chip ${KIND_LABEL[c.kind].cls}`}>{KIND_LABEL[c.kind].label}</span></td>
                <td className="p-3 text-right">{c.orders}</td>
                <td className="p-3 text-right font-semibold">{euros(c.spentCents)}</td>
                <td className="p-3">{c.lastOrderAt ? formatDateTime(c.lastOrderAt) : "—"}</td>
                <td className="p-3 text-right">{c.kind === "GUEST" ? "—" : c.points}</td>
                <td className="p-3">{c.since ? formatDateTime(c.since).slice(0, 10) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Aucun client.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav className="flex items-center gap-3" aria-label="Pages">
        {page > 1 && <Link href={`?${qs({ page: String(page - 1) })}`} className="btn-ghost">← Précédent</Link>}
        <span className="text-sm text-neutral-600">{total} client{total > 1 ? "s" : ""} · page {page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
        {page * PAGE < total && <Link href={`?${qs({ page: String(page + 1) })}`} className="btn-ghost">Suivant →</Link>}
      </nav>
    </div>
  );
}
