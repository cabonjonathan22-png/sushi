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
import { pauseUntilText } from "@/lib/pause";

/** Libellés de durée en français pour le back-office. */
const FR_PAUSE: Record<string, string> = { "pause.untilFurther": "jusqu'à nouvel ordre", "pause.untilTime": "jusqu'à {time}", "pause.untilDay": "jusqu'au {date} inclus", "pause.untilDateTime": "jusqu'au {date} à {time}" };
const frPause = (key: string, vars: Record<string, string> = {}) => FR_PAUSE[key]!.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

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
        <section className={`card p-5 ${paused ? "border-red-300 bg-red-50" : ""}`} aria-labelledby="online-orders">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="online-orders" className="me-auto text-3xl">Commandes en ligne — {current.name}</h2>
            <span className={`chip px-3 py-1 text-sm ${paused ? "bg-red-700 text-white" : "bg-green-100 text-green-800"}`}>{paused ? "FERMÉES" : "Ouvertes"}</span>
          </div>
          {paused && (
            <div className="mt-2 space-y-3">
              <p className="text-lg font-semibold text-red-800">
                Aucune commande n'est possible, pour aucun jour, {pauseUntilText(current.ordersPausedUntil!, frPause, "fr", current.timezone)}.
              </p>
              {current.ordersPausedReason && <p className="rounded-xl bg-white p-3 text-sm">Message affiché aux clients : « {current.ordersPausedReason} »</p>}
              <form action={pauseOrdersAction}>
                <input type="hidden" name="restaurantId" value={current.id} />
                <input type="hidden" name="duree" value="reopen" />
                <SubmitButton className="btn bg-green-700 text-lg text-white hover:bg-green-800">Rouvrir les commandes maintenant</SubmitButton>
              </form>
            </div>
          )}
          <details className="mt-3" open={!paused}>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-700">{paused ? "Modifier la fermeture ou le message" : "Fermer les commandes en ligne"}</summary>
            <form action={pauseOrdersAction} className="mt-3 grid gap-4">
              <input type="hidden" name="restaurantId" value={current.id} />
              <div>
                <label className="label" htmlFor="reason">Message affiché aux clients (bandeau sur tout le site)</label>
                <input id="reason" name="reason" maxLength={200} defaultValue={paused ? current.ordersPausedReason : ""} className="input" placeholder="Congés annuels : réouverture le 4 novembre. Merci de votre fidélité !" />
              </div>
              <fieldset>
                <legend className="label">Durée de la fermeture</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["30", "30 minutes (coup de feu)"], ["60", "1 heure"], ["120", "2 heures"],
                    ["today", "Toute la journée d'aujourd'hui"], ["indefinite", "Jusqu'à nouvel ordre"],
                  ].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                      <input type="radio" name="duree" value={v} defaultChecked={v === "30"} className="h-4 w-4" />{l}
                    </label>
                  ))}
                  <label className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                    <input type="radio" name="duree" value="date" className="h-4 w-4" />Jusqu'au (inclus)
                    <input type="date" name="date" min={today} defaultValue={addDays(today, 1)} className="input min-h-9 w-auto py-1" aria-label="Date de réouverture (veille incluse)" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-neutral-600">
                  Pendant la fermeture, les clients voient la carte mais ne peuvent commander pour aucun jour. Pour des congés connus à l'avance,
                  vous pouvez aussi utiliser « Fermetures exceptionnelles » (Mon restaurant → Horaires) : seuls ces jours-là sont bloqués.
                </p>
              </fieldset>
              <SubmitButton className="btn-danger justify-self-start text-lg">{paused ? "Mettre à jour la fermeture" : "Fermer les commandes"}</SubmitButton>
            </form>
          </details>
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
