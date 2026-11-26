"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MODE_LABELS } from "@/lib/catalog-constants";
import type { BoardOrder } from "@/lib/orders/board";
import { useChime, useLiveOrders } from "./live";

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");

/**
 * Alerte « Nouvelle commande » sur toutes les pages du back-office, en temps réel :
 * fenêtre au premier plan + sonnerie répétée toutes les 20 s jusqu'à ce qu'on la ferme.
 * (Le son s'active au premier clic dans la page : règle des navigateurs.)
 */
export function NewOrderAlert({ restaurantId }: { restaurantId: string }) {
  const [alerts, setAlerts] = useState<BoardOrder[]>([]);
  const chime = useChime();
  const pathname = usePathname();
  useLiveOrders(restaurantId, {
    onNew: (o) => {
      if ((o as { source?: string }).source === "POS") return; // vente au comptoir : pas d'alerte
      setAlerts((a) => (a.some((x) => x.id === o.id) ? a : [...a, o]));
      chime.play();
    },
  });

  // Son activé au premier clic / toucher dans la page.
  useEffect(() => {
    if (chime.enabled) return;
    const on = () => chime.enable();
    window.addEventListener("pointerdown", on, { once: true });
    return () => window.removeEventListener("pointerdown", on);
  }, [chime]);

  // Rappel sonore tant que l'alerte n'est pas fermée.
  useEffect(() => {
    if (!alerts.length || !chime.enabled) return;
    const id = setInterval(chime.play, 20_000);
    return () => clearInterval(id);
  }, [alerts.length, chime.enabled, chime.play]);

  if (!alerts.length) return null;
  const close = () => setAlerts([]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-labelledby="new-order-title">
      <div className="w-full max-w-md animate-[pulse_1s_ease-in-out_2] rounded-3xl bg-white p-6 shadow-2xl ring-4 ring-brand-500">
        <p id="new-order-title" className="font-display text-4xl text-brand-700">🔔 {alerts.length > 1 ? `${alerts.length} nouvelles commandes` : "Nouvelle commande"}</p>
        <ul className="mt-4 space-y-3">
          {alerts.slice(-4).map((o) => (
            <li key={o.id} className="rounded-2xl bg-neutral-100 p-4">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-display text-3xl">n° {o.dailyNumber}</span>
                <span className="text-xl font-bold">{eur(o.totalCents)}</span>
              </p>
              <p className="font-semibold">{MODE_LABELS[o.mode]} · {time(o.slotStart)} · {o.customerName}</p>
              <p className="text-sm text-neutral-600">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
              <p className="mt-1 text-sm font-semibold">{o.paymentStatus === "PAID" ? "Payée en ligne" : "À encaisser"}</p>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          {pathname !== "/admin/commandes" && (
            <Link href="/admin/commandes" onClick={close} className="flex-1 rounded-2xl bg-brand-600 py-4 text-center text-lg font-bold text-white">Voir les commandes</Link>
          )}
          <button type="button" onClick={close} className="flex-1 rounded-2xl bg-ink py-4 text-lg font-bold text-white">OK</button>
        </div>
      </div>
    </div>
  );
}
