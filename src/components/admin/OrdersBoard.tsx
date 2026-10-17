"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { setOrderStatus } from "@/app/admin/(panel)/commandes/actions";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { euros } from "@/lib/money";
import { primaryNext, type OrderStatus } from "@/lib/order-status";
import type { BoardOrder } from "@/lib/orders/board";
import { printTicket, useChime, useDevicePref, useLiveOrders } from "./live";

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: "Nouvelles", statuses: ["NEW"] },
  { title: "En cours", statuses: ["ACCEPTED", "PREPARING"] },
  { title: "Prêtes / en livraison", statuses: ["READY", "OUT_FOR_DELIVERY"] },
];

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "Europe/Paris" });
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function OrdersBoard({ restaurantId, canUpdate, defaultPaper, defaultCopies, deliveryCopies = 2, chimeRepeatSeconds = 20 }: {
  restaurantId: string;
  canUpdate: boolean;
  defaultPaper: string;
  defaultCopies: number;
  deliveryCopies?: number;
  chimeRepeatSeconds?: number;
}) {
  const chime = useChime();
  const [autoPrint, setAutoPrint] = useDevicePref("ys_autoprint", false);
  const [paper, setPaper] = useDevicePref("ys_paper", defaultPaper);
  const [copies, setCopies] = useDevicePref("ys_copies", defaultCopies);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const settings = useRef({ autoPrint, paper, copies, chime });
  settings.current = { autoPrint, paper, copies, chime };

  const { orders, connected, reload } = useLiveOrders(restaurantId, {
    onNew: (o) => {
      settings.current.chime.play();
      if (settings.current.autoPrint) printTicket(o.id, { paper: settings.current.paper, copies: o.mode === "DELIVERY" ? Math.max(deliveryCopies, settings.current.copies) : settings.current.copies });
    },
  });

  // Sonnerie répétée toutes les 20 s tant qu'une commande reste « Nouvelle ».
  const hasNew = orders?.some((o) => o.status === "NEW") ?? false;
  useEffect(() => {
    if (!hasNew || !chime.enabled || chimeRepeatSeconds <= 0) return;
    const id = setInterval(chime.play, chimeRepeatSeconds * 1000);
    return () => clearInterval(id);
  }, [hasNew, chime.enabled, chime.play, chimeRepeatSeconds]);

  const move = (o: BoardOrder, to: OrderStatus, note = "") =>
    start(async () => {
      setError("");
      const r = await setOrderStatus(o.id, to, note);
      if (r?.error) setError(r.error);
      await reload();
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-5xl leading-none">Commandes en cours</h1>
        <span className={`chip ${connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{connected ? "● En direct" : "○ Reconnexion…"}</span>
        {!chime.enabled ? (
          <button type="button" onClick={chime.enable} className="btn bg-amber-400 text-ink">🔔 Activer le son</button>
        ) : <span className="chip bg-neutral-200">🔔 Son activé</span>}
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">🖨️ Impression</summary>
          <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
              Imprimer automatiquement les nouvelles commandes
            </label>
            <label className="block text-sm">Format
              <select className="input mt-1" value={paper} onChange={(e) => setPaper(e.target.value)}>
                <option value="58">Ticket 58 mm</option><option value="80">Ticket 80 mm</option><option value="A4">Feuille A4</option>
              </select>
            </label>
            <label className="block text-sm">Exemplaires (livraison : {deliveryCopies} minimum)
              <select className="input mt-1" value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
                <option value={1}>1</option><option value={2}>2 (cuisine + livreur)</option><option value={3}>3</option>
              </select>
            </label>
            <p className="text-xs text-neutral-600">Réglage propre à cet appareil. Pour imprimer sans fenêtre de confirmation, lancez Chrome avec l'option « --kiosk-printing » (voir le guide).</p>
          </div>
        </details>
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 font-semibold text-red-800">{error}</p>}

      {orders === null ? <p>Chargement…</p> : (
        <div className="grid gap-4 xl:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => col.statuses.includes(o.status as OrderStatus));
            return (
              <section key={col.title} aria-label={col.title} className="min-w-0">
                <h2 className="mb-2 text-3xl">{col.title} <span className="text-neutral-500">({list.length})</span></h2>
                <ul className="space-y-3">
                  {list.length === 0 && <li className="rounded-2xl border-2 border-dashed border-neutral-300 p-6 text-center text-neutral-500">Aucune</li>}
                  {list.map((o) => {
                    const next = primaryNext(o.status as OrderStatus, o.mode);
                    return (
                      <li key={o.id} className={`card overflow-hidden ${o.status === "NEW" ? "ring-4 ring-brand-500" : ""}`}>
                        <div className={`flex items-center justify-between px-4 py-2 text-white ${o.mode === "DELIVERY" ? "bg-blue-800" : o.mode === "DINE_IN" ? "bg-purple-800" : "bg-ink"}`}>
                          <span className="font-display text-3xl">N° {o.dailyNumber}</span>
                          <span className="font-display text-2xl">{MODE_LABELS[o.mode].toUpperCase()}</span>
                          <span className="font-display text-3xl">{isToday(o.slotStart) ? "" : `${day(o.slotStart)} `}{time(o.slotStart)}</span>
                        </div>
                        <div className="p-4">
                          <p className="font-semibold">{o.customerName} · <a href={`tel:${o.customerPhone}`} className="underline">{o.customerPhone}</a></p>
                          {o.address && <p className="text-sm text-neutral-700">{o.address}{o.deliveryNotes && ` — ${o.deliveryNotes}`}</p>}
                          <ul className="mt-2 text-sm">
                            {o.lines.map((l, i) => <li key={i}><strong>{l.qty} ×</strong> {l.name}{l.detail && <span className="text-neutral-600"> ({l.detail})</span>}</li>)}
                          </ul>
                          {o.notes && <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold">📝 {o.notes}</p>}
                          {o.hasAlcohol && <p className="mt-1 text-xs font-semibold text-amber-800">Alcool : vérifier l'âge</p>}
                          <p className="mt-2 flex justify-between text-sm">
                            <span>{PAYMENT_METHOD_LABELS[o.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]}</span>
                            <span className={o.paymentStatus === "PAID" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                              {PAYMENT_STATUS_LABELS[o.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]} · {euros(o.totalCents)}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-neutral-100 p-3">
                          {canUpdate && next && (
                            <button type="button" disabled={pending} onClick={() => move(o, next)} className="btn-primary flex-1 text-lg">
                              {STATUS_LABELS[next]} →
                            </button>
                          )}
                          <button type="button" onClick={() => printTicket(o.id, { paper, copies: o.mode === "DELIVERY" ? Math.max(deliveryCopies, copies) : copies })} className="btn-ghost" aria-label={`Imprimer la commande ${o.dailyNumber}`}>🖨️</button>
                          <Link href={`/admin/commandes/${o.id}`} className="btn-ghost">Détail</Link>
                          {canUpdate && o.status === "NEW" && (
                            <button type="button" disabled={pending} className="btn-ghost text-red-700" onClick={() => {
                              const reason = window.prompt("Motif de l'annulation (envoyé au client) :");
                              if (reason?.trim()) move(o, "CANCELLED", reason);
                            }}>Refuser</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
