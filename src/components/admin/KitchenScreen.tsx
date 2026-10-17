"use client";

import { useEffect, useState, useTransition } from "react";
import { setOrderStatus } from "@/app/admin/(panel)/commandes/actions";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { primaryNext, type OrderStatus } from "@/lib/order-status";
import { useChime, useLiveOrders } from "./live";

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "Europe/Paris" });

/** Écran cuisine / comptoir : plein écran, gros caractères, toucher une commande la fait avancer. */
export function KitchenScreen({ restaurantId, restaurantName, canUpdate }: { restaurantId: string; restaurantName: string; canUpdate: boolean }) {
  const chime = useChime();
  const { orders, connected, reload } = useLiveOrders(restaurantId, { onNew: () => chime.play() });
  const [pending, start] = useTransition();
  // Heure calculée uniquement dans le navigateur (évite un écart avec le rendu serveur).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const list = (orders ?? []).filter((o) => ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status));
  const lateMinutes = (iso: string) => (now ? Math.round((now.getTime() - new Date(iso).getTime()) / 60_000) : 0);
  const sameDay = (iso: string) => !!now && new Date(iso).toDateString() === now.toDateString();

  return (
    <div className="min-h-dvh bg-neutral-950 p-4 text-white">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <h1 className="font-display text-5xl">{restaurantName} — cuisine</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${connected ? "bg-green-700" : "bg-red-700"}`}>{connected ? "EN DIRECT" : "RECONNEXION…"}</span>
        {!chime.enabled && <button type="button" onClick={chime.enable} className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-ink">🔔 Activer le son</button>}
        <button type="button" className="ml-auto rounded-xl bg-white/10 px-4 py-2 font-bold" onClick={() => document.documentElement.requestFullscreen?.()}>Plein écran</button>
        <span className="font-display text-5xl">{now ? time(now.toISOString()) : ""}</span>
      </header>

      {orders === null ? <p className="text-2xl">Chargement…</p> : list.length === 0 ? (
        <p className="mt-20 text-center font-display text-6xl text-neutral-500">Aucune commande en cours</p>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {list.map((o) => {
            const next = primaryNext(o.status as OrderStatus, o.mode);
            const late = lateMinutes(o.slotStart);
            return (
              <li key={o.id}>
                <button type="button" disabled={!canUpdate || !next || pending}
                  onClick={() => next && start(async () => { await setOrderStatus(o.id, next); await reload(); })}
                  className={`flex h-full w-full flex-col overflow-hidden rounded-2xl text-left ${o.status === "NEW" ? "bg-brand-700 ring-4 ring-brand-400" : o.status === "READY" ? "bg-green-800" : "bg-neutral-800"}`}>
                  <div className="flex items-baseline justify-between px-4 pt-3">
                    <span className="font-display text-6xl leading-none">{o.dailyNumber}</span>
                    <span className="font-display text-5xl leading-none">{sameDay(o.slotStart) ? "" : <span className="text-3xl">{dayLabel(o.slotStart)} </span>}{time(o.slotStart)}</span>
                  </div>
                  <div className="flex justify-between px-4 pb-2 text-xl font-bold">
                    <span>{MODE_LABELS[o.mode].toUpperCase()}</span>
                    <span className={o.status === "NEW" ? "animate-pulse rounded bg-white px-2 text-brand-700" : ""}>{STATUS_LABELS[o.status as OrderStatus].toUpperCase()}</span>
                  </div>
                  {late > 0 && o.status !== "READY" && <p className="bg-red-700 px-4 py-1 text-lg font-bold">EN RETARD DE {late} MIN</p>}
                  <ul className="flex-1 space-y-1 bg-black/25 px-4 py-3 text-2xl">
                    {o.lines.map((l, i) => (
                      <li key={i}><strong>{l.qty} ×</strong> {l.name}{l.detail && <span className="block pl-8 text-lg text-neutral-300">{l.detail}</span>}</li>
                    ))}
                  </ul>
                  {o.notes && <p className="bg-amber-300 px-4 py-2 text-xl font-bold text-ink">📝 {o.notes}</p>}
                  {next && canUpdate && <p className="bg-white/10 px-4 py-3 text-center text-xl font-bold">Toucher → {STATUS_LABELS[next]}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
