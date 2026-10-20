import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { activeRewards, balanceOf } from "@/lib/loyalty";
import { cardQrSvg, formatCardNumber, isValidCardNumber } from "@/lib/loyalty-card";
import { euros } from "@/lib/money";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";
import { clientHref } from "@/lib/customers-admin";
import { creditPurchaseAction, redeemInStoreAction } from "../../carte-actions";

export const metadata = { title: "Carte de fidélité" };

/** Carte scannée au comptoir : solde, achat à créditer, récompense à utiliser, impression. */
export default async function CardPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ nouvelle?: string; existant?: string }> }) {
  const { staff, current } = await adminContext("orders.payment");
  const number = (await params).number;
  const sp = await searchParams;
  if (!isValidCardNumber(number)) notFound();
  const c = await db.customer.findUnique({ where: { cardNumber: number } });
  if (!c || c.anonymizedAt) notFound();
  const { loyalty } = await getConfig();
  const [balance, rewards, history, qr] = await Promise.all([
    balanceOf(c.id),
    activeRewards(),
    db.loyaltyTransaction.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    cardQrSvg(number),
  ]);
  const name = `${c.firstName} ${c.lastName}`.trim() || c.email;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/fidelite/scanner" className="text-sm font-semibold underline">← Scanner une autre carte</Link>
      {sp.nouvelle && <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">Carte créée. Imprimez-la ci-dessous ou laissez le client photographier le QR code.</p>}
      {sp.existant && <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">Ce client avait déjà un compte avec cet e-mail : voici sa carte.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="card p-5">
          <p className="text-sm font-semibold text-neutral-600">Carte n° {formatCardNumber(number)}</p>
          <h1 className="text-5xl">{name}</h1>
          <p className="text-neutral-700">{c.phone}{c.phone && c.email && " · "}{c.email}</p>
          <p className="mt-4 font-display text-6xl leading-none">{balance}<span className="ms-2 font-sans text-lg text-neutral-600">point(s)</span></p>
          {can(staff.actor, "customers.view", current?.id) && <Link href={clientHref(c.id)} className="mt-3 inline-block text-sm underline">Fiche client complète</Link>}
        </section>
        <section className="card grid place-items-center gap-2 p-5">
          <div className="w-44" dangerouslySetInnerHTML={{ __html: qr }} />
          <a href={`/admin/fidelite/imprimer/${c.id}?auto=1`} target="_blank" className="btn-ghost w-full">Imprimer (carte)</a>
          <a href={`/admin/fidelite/imprimer/${c.id}?format=ticket&auto=1`} target="_blank" className="btn-ghost w-full">Imprimer (ticket 80 mm)</a>
        </section>
      </div>

      {!loyalty.enabled ? <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">La carte de fidélité est désactivée.</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-3xl">Achat au restaurant</h2>
            <p className="text-sm text-neutral-700">Montant payé en caisse : {loyalty.pointsPerEuro} point(s) par euro. Les commandes en ligne sont créditées automatiquement.</p>
            <ActionForm action={creditPurchaseAction} className="mt-3 grid gap-3" resetOnSuccess>
              <input type="hidden" name="number" value={number} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="amount">Montant (€)</label><input id="amount" name="amount" inputMode="decimal" required placeholder="24,50" className="input text-2xl" /></div>
                <div><label className="label" htmlFor="ticket">N° de ticket (facultatif)</label><input id="ticket" name="ticket" autoComplete="off" className="input" /></div>
              </div>
              <SubmitButton className="btn-primary text-lg" pendingLabel="…">Créditer les points</SubmitButton>
            </ActionForm>
          </section>
          <section className="card p-5">
            <h2 className="text-3xl">Utiliser une récompense</h2>
            {rewards.length === 0 ? <p className="mt-2 text-neutral-600">Aucune récompense active.</p> : (
              <ul className="mt-3 grid gap-2">
                {rewards.map((r) => (
                  <li key={r.id}>
                    <ActionForm action={redeemInStoreAction} confirm={`Utiliser « ${r.name} » (${r.pointsCost} points) ?`}>
                      <input type="hidden" name="number" value={number} />
                      <input type="hidden" name="rewardId" value={r.id} />
                      <button type="submit" disabled={balance < r.pointsCost}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-start ${balance >= r.pointsCost ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-500"}`}>
                        <span><strong className="block">{r.name}</strong>{r.minSubtotalCents > 0 && <span className="text-xs">dès {euros(r.minSubtotalCents)}</span>}</span>
                        <span className="shrink-0 font-semibold">{r.pointsCost} pts</span>
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-3xl">Derniers mouvements</h2>
        {history.length === 0 ? <p className="mt-2 text-neutral-600">Aucun.</p> : (
          <ul className="mt-3 divide-y text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 py-2">
                <span>{formatDateTime(h.createdAt)} — {h.note || h.kind}</span>
                <strong className={h.points >= 0 ? "text-green-800" : "text-red-800"}>{h.points > 0 ? "+" : ""}{h.points}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
