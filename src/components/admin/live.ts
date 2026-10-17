"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardOrder } from "@/lib/orders/board";

/**
 * Commandes en direct : flux SSE + rechargement de la liste à chaque événement.
 * Repli : rechargement toutes les 30 s si le flux est coupé (réseau du restaurant).
 */
export function useLiveOrders(restaurantId: string, opts: { done?: number; onNew?: (o: BoardOrder) => void } = {}) {
  const [orders, setOrders] = useState<BoardOrder[] | null>(null);
  const [connected, setConnected] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const onNew = useRef(opts.onNew);
  onNew.current = opts.onNew;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/orders?restaurant=${restaurantId}&done=${opts.done ?? 0}`, { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/connexion";
      return;
    }
    const data = (await res.json()) as { orders: BoardOrder[] };
    // Nouvelle commande = jamais vue sur cet écran, « Nouvelle » ou acceptée automatiquement.
    if (known.current) {
      for (const o of data.orders) if ((o.status === "NEW" || o.status === "ACCEPTED") && !known.current.has(o.id)) onNew.current?.(o);
    }
    known.current = new Set(data.orders.map((o) => o.id));
    setOrders(data.orders);
  }, [restaurantId, opts.done]);

  useEffect(() => {
    reload().catch(() => {});
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource(`/api/admin/orders/stream?restaurant=${restaurantId}`);
      es.addEventListener("hello", () => setConnected(true));
      es.addEventListener("order", () => reload().catch(() => {}));
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    // Filet de sécurité si le flux temps réel est coupé (hébergement serverless, proxy…).
    const poll = setInterval(() => reload().catch(() => {}), Number(process.env.NEXT_PUBLIC_ORDERS_POLL_SECONDS ?? 30) * 1000);
    return () => {
      es?.close();
      clearTimeout(retry);
      clearInterval(poll);
    };
  }, [restaurantId, reload]);

  return { orders, connected, reload };
}

/** Sonnerie générée (pas de fichier audio) : trois bips, répétée tant que non acquittée. */
export function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enable = () => {
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
    setEnabled(true);
  };
  const play = useCallback(() => {
    const ac = ctx.current;
    if (!ac) return;
    [0, 0.25, 0.5].forEach((t, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.5, ac.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.22);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + 0.25);
    });
  }, []);
  return { enabled, enable, play };
}

/** Préférence locale à l'appareil (son, impression automatique…). */
export function useDevicePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* préférence indisponible */ }
  }, [key]);
  return [value, (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignoré */ }
  }];
}

/** Impression navigateur d'un ticket via une iframe invisible (aucun onglet ouvert). */
export function printTicket(orderId: string, opts: { paper: string; copies: number }) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.src = `/admin/commandes/${orderId}/ticket?papier=${opts.paper}&copies=${opts.copies}&auto=1`;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}
