import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { adminRestaurant } from "@/lib/admin";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { addDays, formatDateTime, localDate, localHHMM, zonedTime } from "@/lib/time";

export const metadata = { title: "Historique des commandes" };

const PAGE = 50;
type SP = { du?: string; au?: string; statut?: string; mode?: string; paiement?: string; origine?: string; q?: string; page?: string };

export default async function History({ searchParams }: { searchParams: Promise<SP> }) {
  const { current } = await adminRestaurant("orders.view");
  const sp = await searchParams;
  const today = localDate(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.du ?? "") ? sp.du! : addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.au ?? "") ? sp.au! : today;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim().slice(0, 80);

  const where: Prisma.OrderWhereInput = {
    restaurantId: current.id,
    placedAt: { gte: zonedTime(from, "00:00"), lt: zonedTime(addDays(to, 1), "00:00") },
    ...(sp.statut && sp.statut in STATUS_LABELS ? { status: sp.statut as keyof typeof STATUS_LABELS } : {}),
    ...(sp.mode && sp.mode in MODE_LABELS ? { mode: sp.mode as keyof typeof MODE_LABELS } : {}),
    ...(sp.paiement && sp.paiement in PAYMENT_METHOD_LABELS ? { paymentMethod: sp.paiement as keyof typeof PAYMENT_METHOD_LABELS } : {}),
    // Origine : commandes du nouveau site, ou historique importé de l'ancien site (hors comptabilité).
    ...(sp.origine === "nouveau" ? { source: { not: "IMPORT_WP" as const } } : sp.origine === "ancien" ? { source: "IMPORT_WP" as const } : {}),
    ...(q ? {
      OR: [
        { customerName: { contains: q, mode: "insensitive" as const } },
        { customerPhone: { contains: q.replace(/\s/g, "") } },
        { customerPhone: { contains: q } },
        { customerEmail: { contains: q, mode: "insensitive" as const } },
        { reference: { contains: q, mode: "insensitive" as const } },
        ...(/^\d+$/.test(q) ? [{ number: Number(q) }, { dailyNumber: Number(q) }] : []),
      ],
    } : {}),
  };
  const [orders, total, sum] = await Promise.all([
    db.order.findMany({ where, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.order.count({ where }),
    db.order.aggregate({ where: { ...where, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _sum: { totalCents: true } }),
  ]);
  const qs = (over: Partial<SP>) => new URLSearchParams(Object.entries({ ...sp, du: from, au: to, ...over }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-5xl">Historique</h1>
      <form className="card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-8 lg:items-end">
        <div><label className="label" htmlFor="du">Du</label><input id="du" name="du" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="au">Au</label><input id="au" name="au" type="date" defaultValue={to} className="input" /></div>
        <div><label className="label" htmlFor="statut">Statut</label>
          <select id="statut" name="statut" defaultValue={sp.statut ?? ""} className="input"><option value="">Tous</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="mode">Mode</label>
          <select id="mode" name="mode" defaultValue={sp.mode ?? ""} className="input"><option value="">Tous</option>{Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="paiement">Paiement</label>
          <select id="paiement" name="paiement" defaultValue={sp.paiement ?? ""} className="input"><option value="">Tous</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="origine">Origine</label>
          <select id="origine" name="origine" defaultValue={sp.origine ?? ""} className="input"><option value="">Toutes</option><option value="nouveau">Nouveau site</option><option value="ancien">Ancien site (archives)</option></select></div>
        <div><label className="label" htmlFor="q">Recherche</label><input id="q" name="q" defaultValue={q} placeholder="Nom, tél., n°…" className="input" /></div>
        <button className="btn-dark">Filtrer</button>
      </form>

      <p className="text-neutral-700">{total} commande{total > 1 ? "s" : ""} · total (hors annulées) <strong>{euros(sum._sum.totalCents ?? 0)}</strong>
        <span className="block text-sm text-neutral-500">Les commandes « Ancien site » sont l'historique importé de WordPress : consultables, mais hors comptabilité.</span></p>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr><th className="p-3">Commande</th><th className="p-3">Passée le</th><th className="p-3">Créneau</th><th className="p-3">Client</th><th className="p-3">Mode</th><th className="p-3">Statut</th><th className="p-3">Paiement</th><th className="p-3 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-brand-50">
                <td className="p-3"><Link href={`/admin/commandes/${o.id}`} className="font-semibold underline">{o.reference}</Link><span className="block text-neutral-500">n° {o.dailyNumber}</span>{o.source === "IMPORT_WP" && <span className="chip mt-1 bg-neutral-200 text-neutral-700">Ancien site</span>}</td>
                <td className="p-3">{formatDateTime(o.placedAt)}</td>
                <td className="p-3">{localDate(o.slotStart).split("-").reverse().join("/")} {localHHMM(o.slotStart)}</td>
                <td className="p-3">{o.customerName}<span className="block text-neutral-500">{o.customerPhone}</span></td>
                <td className="p-3">{MODE_LABELS[o.mode]}</td>
                <td className="p-3">{STATUS_LABELS[o.status]}</td>
                <td className="p-3">{PAYMENT_METHOD_LABELS[o.paymentMethod]}<span className="block text-neutral-500">{PAYMENT_STATUS_LABELS[o.paymentStatus]}</span></td>
                <td className="p-3 text-right font-semibold">{euros(o.totalCents)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Aucune commande.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-2" aria-label="Pages">
        {page > 1 && <Link href={`?${qs({ page: String(page - 1) })}`} className="btn-ghost">← Précédent</Link>}
        {page * PAGE < total && <Link href={`?${qs({ page: String(page + 1) })}`} className="btn-ghost">Suivant →</Link>}
      </nav>
      <p className="text-xs text-neutral-500">Généré le {formatDateTime(new Date())}</p>
    </div>
  );
}
