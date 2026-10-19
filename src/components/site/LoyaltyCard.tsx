import type { MessageKey } from "@/i18n/fr";
import type { T } from "@/i18n/server";
import { db } from "@/lib/db";
import { activeRewards, balanceOf, loyaltySettings } from "@/lib/loyalty";
import { nextReward } from "@/lib/loyalty-rules";
import { money } from "@/lib/money";
import { formatDateTime } from "@/lib/time";

/** Carte de fidélité du client connecté (page « Mon compte »). */
export async function LoyaltyCard({ customerId, t }: { customerId: string; t: T }) {
  const settings = await loyaltySettings();
  if (!settings.enabled) return null;
  const [balance, rewards, history] = await Promise.all([
    balanceOf(customerId),
    activeRewards(),
    db.loyaltyTransaction.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 15, include: { order: { select: { reference: true } } } }),
  ]);
  const next = nextReward(rewards, balance);
  const usable = rewards.some((r) => r.pointsCost <= balance);
  const progress = next ? Math.min(100, Math.round((balance / next.pointsCost) * 100)) : 100;
  const describe = (r: (typeof rewards)[number]) =>
    r.type === "AMOUNT" ? t("loyalty.typeAmount", { amount: money(r.value) }) : r.type === "PERCENT" ? t("loyalty.typePercent", { percent: r.value }) : t("loyalty.typeProduct", { product: r.product?.name ?? r.name });

  return (
    <section id="fidelite" className="overflow-hidden rounded-3xl bg-char text-paper" aria-labelledby="loyalty-title">
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_1.2fr] sm:p-8">
        <div>
          <p className="eyebrow">{t("loyalty.balance")}</p>
          <h2 id="loyalty-title" className="mt-2 text-3xl">{t("loyalty.title")}</h2>
          <p className="mt-4 font-display text-6xl leading-none">{balance}<span className="ms-2 font-sans text-lg text-paper/70">{t("loyalty.points")}</span></p>
          {next && (
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div>
              <p className="mt-2 text-sm text-paper/80">{t("loyalty.next", { points: next.pointsCost - balance, name: next.name })}</p>
            </div>
          )}
          {usable && <p className="mt-3 rounded-xl bg-white/10 p-3 text-sm">{t("loyalty.ready")}</p>}
          <p className="mt-4 text-xs text-paper/60">
            {t("loyalty.how1", { per: settings.pointsPerEuro })} {settings.expiryMonths > 0 && t("loyalty.expiry", { months: settings.expiryMonths })}
          </p>
        </div>
        <div>
          <h3 className="text-xl">{t("loyalty.rewardsTitle")}</h3>
          {rewards.length === 0 ? <p className="mt-2 text-sm text-paper/70">{t("loyalty.noRewards")}</p> : (
            <ul className="mt-3 grid gap-2">
              {rewards.map((r) => (
                <li key={r.id} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${r.pointsCost <= balance ? "bg-brand-600 text-white" : "bg-white/10"}`}>
                  <span className="min-w-0"><strong className="block">{r.name}</strong><span className="text-xs opacity-80">{describe(r)}{r.minSubtotalCents > 0 && ` · ${t("loyalty.from", { amount: money(r.minSubtotalCents) })}`}</span></span>
                  <span className="shrink-0 font-semibold">{r.pointsCost} {t("loyalty.pts")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <details className="border-t border-white/10 px-6 py-4 sm:px-8">
        <summary className="cursor-pointer text-sm font-semibold">{t("loyalty.history")}</summary>
        {history.length === 0 ? <p className="mt-2 text-sm text-paper/70">{t("loyalty.noHistory")}</p> : (
          <ul className="mt-3 divide-y divide-white/10 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 py-2">
                <span>{t(`loyalty.kind.${h.kind}` as MessageKey)}{h.order ? ` · ${h.order.reference}` : h.note ? ` · ${h.note}` : ""}<span className="block text-xs text-paper/60">{formatDateTime(h.createdAt)}</span></span>
                <span className={`shrink-0 font-semibold ${h.points >= 0 ? "text-green-300" : "text-paper/70"}`}>{h.points > 0 ? "+" : ""}{h.points}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
