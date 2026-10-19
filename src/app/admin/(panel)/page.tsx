import Link from "next/link";
import { SubmitButton } from "@/components/admin/forms";
import { ACCOUNTED } from "@/lib/accounting-db";
import { adminContext } from "@/lib/admin";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { ACTIVE_STATUSES } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { localDate, localHHMM, zonedTime, addDays } from "@/lib/time";
import { pauseOrdersAction } from "./actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { staff, current } = await adminContext();
  const ok = (await searchParams).ok;
  if (!current) return <p className="card p-6">Aucun restaurant ne vous est attribué. Contactez le propriétaire.</p>;

  const today = localDate(new Date());
  const from = zonedTime(today, "00:00");
  const to = zonedTime(addDays(today, 1), "00:00");
  const [todayOrders, active] = await Promise.all([
    db.order.findMany({
      where: { ...ACCOUNTED, restaurantId: current.id, placedAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } },
      select: { totalCents: true, mode: true },
    }),
    db.order.count({ where: { restaurantId: current.id, status: { in: ACTIVE_STATUSES } } }),
  ]);
  const revenue = todayOrders.reduce((s, o) => s + o.totalCents, 0);
  const paused = current.ordersPausedUntil && current.ordersPausedUntil > new Date();
  const showMoney = can(staff.actor, "accounting.view", current.id);

  return (
    <div className="space-y-6">
      {ok === "2fa" && <p className="rounded-xl bg-green-50 p-4 font-semibold text-green-800">Double authentification activée.</p>}
      <h1 className="text-5xl">Bonjour {staff.user.name.split(" ")[0]}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/commandes" className="card p-5 hover:border-ink">
          <p className="text-sm font-semibold text-neutral-600">Commandes en cours</p>
          <p className="font-display text-6xl leading-none">{active}</p>
        </Link>
        <div className="card p-5">
          <p className="text-sm font-semibold text-neutral-600">Commandes aujourd'hui</p>
          <p className="font-display text-6xl leading-none">{todayOrders.length}</p>
        </div>
        {showMoney && (
          <Link href="/admin/compta" className="card p-5 hover:border-ink">
            <p className="text-sm font-semibold text-neutral-600">Chiffre d'affaires du jour (TTC)</p>
            <p className="font-display text-6xl leading-none">{euros(revenue)}</p>
          </Link>
        )}
      </div>

      {can(staff.actor, "orders.update", current.id) && (
        <section className={`card p-5 ${paused ? "border-red-300 bg-red-50" : ""}`}>
          <h2 className="text-3xl">Commandes en ligne</h2>
          {paused ? (
            <>
              <p className="mt-1 font-semibold text-red-800">
                FERMÉES jusqu'à {localHHMM(current.ordersPausedUntil!)} {localDate(current.ordersPausedUntil!) !== today ? `le ${current.ordersPausedUntil!.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}
                {current.ordersPausedReason && ` — « ${current.ordersPausedReason} »`}
              </p>
              <form action={pauseOrdersAction} className="mt-3">
                <input type="hidden" name="restaurantId" value={current.id} />
                <input type="hidden" name="minutes" value="0" />
                <SubmitButton className="btn bg-green-700 text-lg text-white">Rouvrir les commandes</SubmitButton>
              </form>
            </>
          ) : (
            <form action={pauseOrdersAction} className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <input type="hidden" name="restaurantId" value={current.id} />
              <div>
                <label className="label" htmlFor="reason">Message affiché aux clients (facultatif)</label>
                <input id="reason" name="reason" className="input" placeholder="Trop de commandes, retour dans 30 minutes" />
              </div>
              <select name="minutes" className="input" defaultValue="30" aria-label="Durée">
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 heure</option>
                <option value="-1">Jusqu'à demain</option>
              </select>
              <SubmitButton className="btn-danger text-lg">Fermer les commandes maintenant</SubmitButton>
            </form>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/cuisine" className="btn-dark py-5 text-lg">Écran cuisine</Link>
        <Link href="/admin/menu" className="btn-ghost py-5 text-lg">Mettre un produit en rupture</Link>
        <Link href={`/commander/${current.slug}`} target="_blank" className="btn-ghost py-5 text-lg">Voir le site</Link>
      </div>
    </div>
  );
}
