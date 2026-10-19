import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { adminContext } from "@/lib/admin";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { db } from "@/lib/db";
import { euros, vatLabel, type VatLine } from "@/lib/money";
import { allowedTransitions } from "@/lib/order-status";
import { loadOrder, type OrderLineOption } from "@/lib/orders/load";
import { refundable } from "@/lib/orders/manage";
import { getConfig } from "@/lib/config";
import { can } from "@/lib/permissions";
import { formatDateTime, formatDay, localDate, localHHMM } from "@/lib/time";

export const metadata = { title: "Commande" };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await adminContext();
  const order = await loadOrder((await params).id);
  if (!order) notFound();
  if (!can(staff.actor, "orders.view", order.restaurantId)) redirect("/admin/acces-refuse");

  const printer = await db.printer.findFirst({ where: { restaurantId: order.restaurantId, method: "BROWSER", active: true } });
  const paper = printer?.paperWidth === "MM58" ? "58" : printer?.paperWidth === "A4" ? "A4" : "80";
  const refunded = order.refunds.reduce((s, r) => s + r.amountCents, 0);
  const vat = order.vatBreakdown as unknown as VatLine[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/commandes" className="text-sm font-semibold underline">← Commandes en cours</Link>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-6xl leading-none">N° {order.dailyNumber}</h1>
        <span className="chip bg-ink px-3 py-1 text-base text-white">{MODE_LABELS[order.mode].toUpperCase()}</span>
        <span className="chip bg-brand-100 px-3 py-1 text-base">{STATUS_LABELS[order.status]}</span>
        <span className="text-neutral-600">{order.reference} · passée le {formatDateTime(order.placedAt)}</span>
      </div>
      {order.source === "IMPORT_WP" && (
        <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-700">Commande de l'ancien site (historique importé de WordPress) : consultable, mais exclue de la comptabilité et des clôtures.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-3xl">Client & créneau</h2>
            <p className="mt-2 text-lg"><strong>{formatDay(localDate(order.slotStart))} à {localHHMM(order.slotStart)}</strong> ({order.period === "LUNCH" ? "midi" : "soir"})</p>
            <p className="mt-1">{order.customerName} — <a href={`tel:${order.customerPhone}`} className="font-semibold underline">{order.customerPhone}</a> — {order.customerEmail}</p>
            {order.mode === "DELIVERY" && (
              <div className="mt-3 rounded-xl bg-blue-50 p-3">
                <p className="font-semibold">{order.addressStreet}{order.addressExtra && `, ${order.addressExtra}`}</p>
                <p>{order.postalCode} {order.city} · {order.zoneName}</p>
                {order.deliveryNotes && <p className="text-sm">Livreur : {order.deliveryNotes}</p>}
                <a className="mt-1 inline-block text-sm underline" target="_blank" rel="noopener"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.addressStreet}, ${order.postalCode} ${order.city}`)}`}>Ouvrir l'itinéraire</a>
              </div>
            )}
            {order.notes && <p className="mt-3 rounded-xl bg-amber-100 p-3 font-semibold">📝 {order.notes}</p>}
          </section>

          <section className="card p-5">
            <h2 className="text-3xl">Produits</h2>
            <table className="mt-2 w-full text-left">
              <tbody className="divide-y divide-neutral-100">
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-2 align-top font-bold">{l.quantity}×</td>
                    <td className="py-2">
                      {l.name}{l.isAlcohol && " 🍷"}
                      {(l.variantLabel || (l.options as unknown as OrderLineOption[]).length > 0) && (
                        <span className="block text-sm text-neutral-600">{[l.variantLabel, ...(l.options as unknown as OrderLineOption[]).map((o) => `${o.name}${o.priceDeltaCents ? ` (+${euros(o.priceDeltaCents)})` : ""}`)].filter(Boolean).join(" · ")}</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-sm text-neutral-500">{vatLabel(l.vatRate)}</td>
                    <td className="py-2 pl-3 text-right font-semibold">{euros(l.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 border-t pt-3">
              <div className="flex justify-between"><dt>Sous-total</dt><dd>{euros(order.subtotalCents)}</dd></div>
              {order.extrasDiscountCents > 0 && <div className="flex justify-between"><dt>Petits plus offerts</dt><dd>−{euros(order.extrasDiscountCents)}</dd></div>}
              {order.discountCents > 0 && <div className="flex justify-between"><dt>Remise {order.promoCode}</dt><dd>−{euros(order.discountCents)}</dd></div>}
              {order.mode === "DELIVERY" && <div className="flex justify-between"><dt>Livraison</dt><dd>{euros(order.deliveryFeeCents)}</dd></div>}
              <div className="flex justify-between text-xl font-bold"><dt>Total TTC</dt><dd>{euros(order.totalCents)}</dd></div>
              {vat.map((v) => (
                <div key={v.rate} className="flex justify-between text-sm text-neutral-600"><dt>TVA {vatLabel(v.rate)} (HT {euros(v.baseCents)})</dt><dd>{euros(v.vatCents)}</dd></div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-3xl">Paiement</h2>
            <p className="mt-1">{PAYMENT_METHOD_LABELS[order.paymentMethod]} — <strong>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</strong></p>
            <ul className="mt-2 text-sm text-neutral-700">
              {order.payments.map((p) => (
                <li key={p.id}>{formatDateTime(p.createdAt)} · {PAYMENT_METHOD_LABELS[p.method]} · {euros(p.amountCents)} · {p.status}{p.failureReason && ` (${p.failureReason})`}</li>
              ))}
              {order.refunds.map((r) => (
                <li key={r.id} className="text-red-700">{formatDateTime(r.createdAt)} · Avoir {r.creditNumber} · −{euros(r.amountCents)} · {r.reason}</li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-3xl">Historique</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {order.statusEvents.map((e) => (
                <li key={e.id}>{formatDateTime(e.at)} — {e.from ? `${STATUS_LABELS[e.from]} → ` : ""}<strong>{STATUS_LABELS[e.to]}</strong> par {e.actor || "—"}{e.note && ` (« ${e.note} »)`}</li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="card h-fit p-5">
          <OrderActions
            orderId={order.id}
            transitions={allowedTransitions(order.status, order.mode)}
            canUpdate={can(staff.actor, "orders.update", order.restaurantId)}
            canPay={can(staff.actor, "orders.payment", order.restaurantId)}
            canRefund={can(staff.actor, "orders.refund", order.restaurantId)}
            unpaid={order.paymentStatus === "UNPAID" && order.status !== "CANCELLED"}
            refundableCents={refundable(order, refunded)}
            paper={paper}
            copies={order.mode === "DELIVERY" ? Math.max((await getConfig()).printing.deliveryCopies, printer?.copies ?? 1) : printer?.copies ?? 1}
          />
        </aside>
      </div>
    </div>
  );
}
