import Link from "next/link";
import { adminContext } from "@/lib/admin";
import { reportFor } from "@/lib/accounting-db";
import type { Grouping } from "@/lib/accounting";
import { MODE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/catalog-constants";
import { euros, vatLabel } from "@/lib/money";
import { can } from "@/lib/permissions";
import { addDays, localDate } from "@/lib/time";

export const metadata = { title: "Comptabilité" };

type SP = { du?: string; au?: string; par?: string; resto?: string };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { staff, restaurants, current } = await adminContext("accounting.view");
  const sp = await searchParams;
  const today = localDate(new Date());
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isDate(sp.du) ? sp.du! : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.au) ? sp.au! : today;
  const grouping: Grouping = sp.par === "week" || sp.par === "month" ? sp.par : "day";
  const allowed = restaurants.filter((r) => can(staff.actor, "accounting.view", r.id));
  const selected = sp.resto === "tous" ? allowed : allowed.filter((r) => r.id === (sp.resto ?? current?.id));
  const ids = selected.map((r) => r.id);
  const { report: r } = await reportFor(ids, from, to, grouping);
  const qs = new URLSearchParams({ du: from, au: to, par: grouping, resto: sp.resto ?? current?.id ?? "" }).toString();

  const presets: [string, string, string][] = [
    ["Aujourd'hui", today, today],
    ["Hier", addDays(today, -1), addDays(today, -1)],
    ["7 jours", addDays(today, -6), today],
    ["Ce mois", `${today.slice(0, 7)}-01`, today],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-5xl">Comptabilité</h1>
        <Link href="/admin/compta/clotures" className="btn-dark">Clôtures journalières</Link>
      </div>

      <form className="card grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <div><label className="label" htmlFor="du">Du</label><input id="du" name="du" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="au">Au</label><input id="au" name="au" type="date" defaultValue={to} className="input" /></div>
        <div><label className="label" htmlFor="par">Regrouper par</label>
          <select id="par" name="par" defaultValue={grouping} className="input"><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option></select></div>
        <div><label className="label" htmlFor="resto">Restaurant</label>
          <select id="resto" name="resto" defaultValue={sp.resto ?? current?.id} className="input">
            {allowed.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {allowed.length > 1 && <option value="tous">Tous les restaurants</option>}
          </select></div>
        <button className="btn-dark">Afficher</button>
        <div className="flex flex-wrap gap-2 sm:col-span-5">
          {presets.map(([l, a, b]) => <Link key={l} href={`?${new URLSearchParams({ du: a, au: b, par: grouping, resto: sp.resto ?? current?.id ?? "" })}`} className="chip bg-neutral-100 px-3 py-1.5 text-sm">{l}</Link>)}
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Chiffre d'affaires TTC", euros(r.ttc)],
          ["dont HT / TVA", `${euros(r.ht)} / ${euros(r.vat)}`],
          ["Commandes", String(r.orders)],
          ["Panier moyen", euros(r.averageBasket)],
        ].map(([l, v]) => (
          <div key={l} className="card p-4"><p className="text-sm font-semibold text-neutral-600">{l}</p><p className="font-display text-4xl leading-tight">{v}</p></div>
        ))}
      </div>
      {r.refunds > 0 && <p className="rounded-xl bg-amber-50 p-3">Remboursements / avoirs sur la période : <strong>−{euros(r.refunds)}</strong> · net {euros(r.netTtc)}</p>}

      <div className="flex flex-wrap gap-2">
        <a href={`/admin/compta/export?${qs}&format=xlsx`} className="btn-primary">Export Excel (comptable)</a>
        <a href={`/admin/compta/export?${qs}&format=csv`} className="btn-ghost">Export CSV</a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto p-5">
          <h2 className="text-3xl">Par {grouping === "day" ? "jour" : grouping === "week" ? "semaine" : "mois"}</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-neutral-600"><tr><th className="py-2">Période</th><th className="py-2 text-right">Cdes</th><th className="py-2 text-right">HT</th><th className="py-2 text-right">TVA</th><th className="py-2 text-right">TTC</th></tr></thead>
            <tbody className="divide-y">
              {r.buckets.map((b) => <tr key={b.key}><td className="py-2">{b.label}</td><td className="py-2 text-right">{b.orders}</td><td className="py-2 text-right">{euros(b.ht)}</td><td className="py-2 text-right">{euros(b.vat)}</td><td className="py-2 text-right font-semibold">{euros(b.ttc)}</td></tr>)}
              {r.buckets.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Aucune vente.</td></tr>}
            </tbody>
          </table>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-3xl">TVA</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="text-neutral-600"><tr><th className="py-1 text-left">Taux</th><th className="py-1 text-right">HT</th><th className="py-1 text-right">TVA</th><th className="py-1 text-right">TTC</th></tr></thead>
              <tbody className="divide-y">{r.byVat.map((v) => <tr key={v.rate}><td className="py-1">{vatLabel(v.rate)}</td><td className="py-1 text-right">{euros(v.ht)}</td><td className="py-1 text-right">{euros(v.vat)}</td><td className="py-1 text-right">{euros(v.ttc)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="card p-5">
            <h2 className="text-3xl">Par mode</h2>
            <ul className="mt-2 text-sm">{Object.entries(r.byMode).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{MODE_LABELS[k as keyof typeof MODE_LABELS]} ({v.orders})</span><strong>{euros(v.ttc)}</strong></li>)}</ul>
          </section>
          <section className="card p-5">
            <h2 className="text-3xl">Par moyen de paiement</h2>
            <ul className="mt-2 text-sm">{Object.entries(r.byPayment).map(([k, v]) => (
              <li key={k} className="flex justify-between py-1"><span>{PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k} ({v.orders})</span><span><strong>{euros(v.ttc)}</strong>{v.paid !== v.ttc && <span className="text-neutral-500"> · réglé {euros(v.paid)}</span>}</span></li>
            ))}</ul>
          </section>
        </div>
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="text-3xl">Produits les plus vendus <span className="text-base font-normal text-neutral-600">(par chiffre d'affaires)</span></h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y">{r.topProducts.map((p, i) => <tr key={p.name}><td className="w-8 py-1 text-neutral-500">{i + 1}</td><td className="py-1">{p.name}</td><td className="py-1 text-right">{p.quantity}</td><td className="py-1 text-right">{euros(p.ttc)}</td></tr>)}</tbody>
        </table>
      </section>
      <p className="text-xs text-neutral-500">Ventes rattachées à la date de service (créneau). Commandes annulées et paiements non aboutis exclus.</p>
    </div>
  );
}
