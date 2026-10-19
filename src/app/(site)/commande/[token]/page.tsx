import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/order/AutoRefresh";
import { ReorderButton } from "@/components/order/ReorderButton";
import { ResumePayment } from "@/components/order/ResumePayment";
import { telHref } from "@/components/site/SiteChrome";
import { getI18n } from "@/i18n/server";
import { readConfig } from "@/lib/config";
import { pointsFor } from "@/lib/loyalty-rules";
import type { MessageKey } from "@/i18n/fr";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import type { OrderLineOption } from "@/lib/orders/load";
import { formatDay, localDate, localHHMM } from "@/lib/time";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STEPS = {
  PICKUP: ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"],
  DINE_IN: ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"],
  DELIVERY: ["NEW", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"],
} as const;

export default async function TrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ nouvelle?: string }> }) {
  const { token } = await params;
  const isNew = (await searchParams).nouvelle === "1";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const o = await db.order.findUnique({
    where: { trackingToken: token },
    include: { lines: { orderBy: { sortOrder: "asc" } }, restaurant: { select: { name: true, slug: true, street: true, postalCode: true, city: true, phones: true } } },
  });
  if (!o) notFound();

  // Fidélité : points gagnés (commande remise) ou à gagner, et récompense utilisée.
  const loyaltySettings = (await readConfig()).loyalty;
  let loyaltyLine = "";
  if (o.customerId && loyaltySettings.enabled && o.source !== "IMPORT_WP" && o.status !== "CANCELLED") {
    const earned = (await db.loyaltyTransaction.aggregate({ where: { orderId: o.id, kind: "EARN" }, _sum: { points: true } }))._sum.points ?? 0;
    const i18n = await getI18n();
    loyaltyLine = [
      o.loyaltyPointsSpent > 0 ? i18n.t("loyalty.spent", { name: o.loyaltyRewardName, points: o.loyaltyPointsSpent }) : "",
      earned > 0 ? i18n.t("loyalty.earned", { points: earned }) : i18n.t("loyalty.toEarn", { points: pointsFor(o.totalCents - o.deliveryFeeCents, loyaltySettings.pointsPerEuro) }),
    ].filter(Boolean).join(" ");
  }
  const { t, locale } = await getI18n();
  const steps = STEPS[o.mode] as readonly string[];
  const current = steps.indexOf(o.status);
  const active = !["COMPLETED", "CANCELLED"].includes(o.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {active && <AutoRefresh seconds={20} />}
      {isNew && o.status !== "PENDING_PAYMENT" && (
        <div className="mb-6 rounded-2xl bg-green-700 p-5 text-white" role="status">
          <p className="font-display text-4xl leading-none">{t("track.thanks")}</p>
          {o.customerEmail && <p className="mt-1">{t("track.emailSent", { email: o.customerEmail })}</p>}
        </div>
      )}

      <p className="text-sm font-semibold uppercase tracking-wider text-neutral-600">{t("track.order", { reference: o.reference })}</p>
      <h1 className="text-6xl leading-none">{t("track.number", { n: o.dailyNumber })}</h1>
      <p className="mt-2 text-lg">
        {t("track.slot", { mode: t(`mode.${o.mode}`), day: formatDay(localDate(o.slotStart), locale), time: localHHMM(o.slotStart) })}
      </p>

      {o.status === "PENDING_PAYMENT" ? (
        <div className="card mt-6 p-5">
          <h2 className="text-3xl">{t("track.pendingTitle")}</h2>
          <p className="mb-4 text-neutral-700">{t("track.pendingText")}</p>
          <ResumePayment token={o.trackingToken} amountCents={o.totalCents} />
        </div>
      ) : o.status === "CANCELLED" ? (
        <div className="mt-6 rounded-2xl bg-red-50 p-5 text-red-900">
          <p className="text-xl font-bold">{t("track.cancelled")}</p>
          {o.cancelReason && <p>{t("track.reason", { reason: o.cancelReason })}</p>}
        </div>
      ) : (
        <ol className="mt-6 grid gap-2" aria-label={t("track.progress")}>
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${i <= current ? "bg-ink text-white" : "bg-white text-neutral-500 ring-1 ring-neutral-200"}`}
              aria-current={i === current ? "step" : undefined}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${i <= current ? "bg-brand-500 text-ink" : "bg-neutral-200"}`}>{i < current ? "✓" : i + 1}</span>
              <span className="font-semibold">{t(`status.${s}` as MessageKey)}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="card mt-6 p-5">
        <h2 className="text-3xl">{t("track.detail")}</h2>
        <ul className="mt-2 divide-y divide-neutral-100">
          {o.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span>{l.quantity} × {l.name}
                {(l.variantLabel || (l.options as unknown as OrderLineOption[]).length > 0) && (
                  <span className="block text-sm text-neutral-600">{[l.variantLabel, ...(l.options as unknown as OrderLineOption[]).map((x) => x.name)].filter(Boolean).join(" · ")}</span>
                )}
              </span>
              <span className="font-semibold">{euros(l.totalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-neutral-200 pt-2">
          {o.extrasDiscountCents > 0 && <div className="flex justify-between"><dt>{t("track.extras")}</dt><dd>−{euros(o.extrasDiscountCents)}</dd></div>}
          {o.discountCents > 0 && <div className="flex justify-between"><dt>{t("track.discount", { code: o.promoCode })}</dt><dd>−{euros(o.discountCents)}</dd></div>}
          {o.loyaltyDiscountCents > 0 && <div className="flex justify-between"><dt>{t("loyalty.discount", { name: o.loyaltyRewardName })}</dt><dd>−{euros(o.loyaltyDiscountCents)}</dd></div>}
          {o.mode === "DELIVERY" && <div className="flex justify-between"><dt>{t("checkout.delivery")}</dt><dd>{o.deliveryFeeCents ? euros(o.deliveryFeeCents) : t("checkout.deliveryFree")}</dd></div>}
          <div className="flex justify-between text-xl font-bold"><dt>{t("checkout.total")}</dt><dd>{euros(o.totalCents)}</dd></div>
          <div className="flex justify-between text-sm text-neutral-700"><dt>{t(`pay.${o.paymentMethod}`)}</dt><dd>{t(`payStatus.${o.paymentStatus}`)}</dd></div>
        </dl>
        {loyaltyLine && <p className="mt-3 rounded-xl bg-linen p-3 text-sm">{loyaltyLine}</p>}
        {o.mode === "DELIVERY" ? (
          <p className="mt-3 text-sm text-neutral-700">{t("track.deliveryTo", { address: `${o.addressStreet}${o.addressExtra ? `, ${o.addressExtra}` : ""}, ${o.postalCode} ${o.city}` })}</p>
        ) : (
          <p className="mt-3 text-sm text-neutral-700">{t("track.pickupAt", { address: `${o.restaurant.name}, ${o.restaurant.street}, ${o.restaurant.postalCode} ${o.restaurant.city}` })}</p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {o.restaurant.phones[0] && <a href={telHref(o.restaurant.phones[0])} className="btn-ghost">{t("track.call")}</a>}
        {o.status !== "PENDING_PAYMENT" && (
          <ReorderButton slug={o.restaurant.slug} lines={o.lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId!, variantId: l.variantId, quantity: l.quantity,
            optionIds: (l.options as unknown as OrderLineOption[]).map((x) => x.id).filter((x): x is string => !!x),
          }))} />
        )}
      </div>
    </div>
  );
}
