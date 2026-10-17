"use client";

import { useActionState, useState } from "react";
import { saveHoursAction } from "@/app/admin/(panel)/restaurant/actions";
import { WEEKDAY_ORDER, WEEKDAYS } from "@/lib/catalog-constants";
import { SubmitButton } from "./forms";

type Range = { weekday: number; opens: string; closes: string; period: "LUNCH" | "DINNER" };

/** Horaires par jour, plusieurs plages (midi / soir). « Copier sur tous les jours » pour aller vite. */
export function HoursEditor({ restaurantId, initial, cutoff = "16:00" }: { restaurantId: string; initial: Range[]; cutoff?: string }) {
  const [state, action] = useActionState(saveHoursAction, undefined);
  const [ranges, setRanges] = useState<Range[]>(initial);

  const update = (i: number, patch: Partial<Range>) => setRanges((r) => r.map((x, j) => (j === i ? { ...x, ...patch, period: (patch.opens ?? x.opens) < cutoff ? "LUNCH" : "DINNER" } : x)));
  const copyToAll = (weekday: number) => {
    const model = ranges.filter((r) => r.weekday === weekday);
    // Recopie sur les jours ouverts ; les jours fermés le restent.
    const open = new Set(ranges.map((r) => r.weekday));
    setRanges(WEEKDAY_ORDER.filter((d) => open.has(d)).flatMap((d) => model.map((m) => ({ ...m, weekday: d }))));
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="hours" value={JSON.stringify(ranges)} />
      {WEEKDAY_ORDER.map((d) => {
        const day = ranges.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d);
        return (
          <div key={d} className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
            <p className="font-semibold">{WEEKDAYS[d]}</p>
            <div className="flex flex-wrap gap-2">
              {day.length === 0 && <span className="py-2 text-neutral-500">Fermé</span>}
              {day.map(({ r, i }) => (
                <span key={i} className="flex items-center gap-1 rounded-xl bg-neutral-50 p-1">
                  <input type="time" value={r.opens} onChange={(e) => update(i, { opens: e.target.value })} className="input w-28" aria-label={`${WEEKDAYS[d]} ouverture`} />
                  <span aria-hidden>→</span>
                  <input type="time" value={r.closes} onChange={(e) => update(i, { closes: e.target.value })} className="input w-28" aria-label={`${WEEKDAYS[d]} fermeture`} />
                  <span className="px-1 text-xs text-neutral-600">{r.period === "LUNCH" ? "midi" : "soir"}</span>
                  <button type="button" onClick={() => setRanges((x) => x.filter((_, j) => j !== i))} className="rounded-lg px-2 py-2 text-red-700 hover:bg-red-50" aria-label="Retirer la plage">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost min-h-10 px-3 text-sm"
                onClick={() => setRanges((x) => [...x, day.length ? { weekday: d, opens: "17:30", closes: "21:30", period: "DINNER" } : { weekday: d, opens: "10:00", closes: "14:00", period: "LUNCH" }])}>
                + plage
              </button>
              {day.length > 0 && <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => copyToAll(d)} title="Appliquer ces horaires aux jours ouverts">Copier partout</button>}
            </div>
          </div>
        );
      })}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 font-semibold text-red-800">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 font-semibold text-green-800">{state.ok}</p>}
      <SubmitButton>Enregistrer les horaires</SubmitButton>
      <p className="text-sm text-neutral-600">Les plages commençant avant {cutoff.replace(":", " h ")} comptent comme « midi » (minimum de commande du midi), les autres comme « soir ».</p>
    </form>
  );
}
