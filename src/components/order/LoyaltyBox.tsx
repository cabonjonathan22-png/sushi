"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { euros } from "@/lib/money";

export interface LoyaltyPreview {
  loggedIn: boolean;
  balance: number;
  pointsToEarn: number;
  rewards: {
    id: string; name: string; description: string; type: "AMOUNT" | "PERCENT" | "FREE_PRODUCT"; value: number; productName: string;
    pointsCost: number; minSubtotalCents: number; problem: string | null;
  }[];
}

/** Carte de fidélité au moment de commander : solde, récompenses utilisables, points à gagner. */
export function LoyaltyBox({ loyalty, rewardId, onChange }: { loyalty: LoyaltyPreview; rewardId: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  if (!loyalty.loggedIn) {
    return (
      <div className="mt-4 rounded-2xl bg-linen p-4 text-sm">
        <p className="font-semibold">{t("loyalty.title")}</p>
        <p className="mt-1 text-muted">{t("loyalty.guest", { points: loyalty.pointsToEarn })}</p>
        <Link href="/compte" className="mt-2 inline-block font-semibold underline">{t("loyalty.loginToEarn")}</Link>
      </div>
    );
  }
  const describe = (r: LoyaltyPreview["rewards"][number]) =>
    r.type === "AMOUNT" ? t("loyalty.typeAmount", { amount: euros(r.value) }) : r.type === "PERCENT" ? t("loyalty.typePercent", { percent: r.value }) : t("loyalty.typeProduct", { product: r.productName });
  return (
    <fieldset className="mt-4 rounded-2xl bg-linen p-4 text-sm">
      <legend className="sr-only">{t("loyalty.title")}</legend>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">{t("loyalty.title")}</p>
        <p><strong className="text-lg">{loyalty.balance}</strong> {t("loyalty.points")}</p>
      </div>
      {loyalty.rewards.length > 0 && (
        <div className="mt-3 grid gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ${rewardId === "" ? "ring-char" : "ring-line"}`}>
            <input type="radio" name="reward" checked={rewardId === ""} onChange={() => onChange("")} className="h-4 w-4 accent-brand-600" />
            <span>{t("loyalty.none")}</span>
          </label>
          {loyalty.rewards.map((r) => {
            const usable = !r.problem;
            return (
              <label key={r.id} className={`flex items-start gap-2 rounded-xl bg-white p-2.5 ring-1 ${rewardId === r.id ? "ring-char" : "ring-line"} ${usable ? "cursor-pointer" : "opacity-55"}`}>
                <input type="radio" name="reward" disabled={!usable} checked={rewardId === r.id} onChange={() => onChange(r.id)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2"><strong>{r.name}</strong><span className="shrink-0 text-muted">{r.pointsCost} {t("loyalty.pts")}</span></span>
                  <span className="block text-xs text-muted">
                    {describe(r)}
                    {r.problem === "NOT_ENOUGH_POINTS" && ` · ${t("loyalty.missing", { points: r.pointsCost - loyalty.balance })}`}
                    {r.problem === "MINIMUM" && ` · ${t("loyalty.from", { amount: euros(r.minSubtotalCents) })}`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-muted">{t("loyalty.willEarn", { points: loyalty.pointsToEarn })}</p>
    </fieldset>
  );
}
