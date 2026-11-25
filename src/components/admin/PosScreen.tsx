"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  posDrawerAction, posFindCustomerAction, posPreviewAction, posReceiptAction, posReprintAction, posSaleAction, posTodayAction,
} from "@/app/admin/(print)/caisse/actions";
import { setOrderStatus } from "@/app/admin/(panel)/commandes/actions";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { primaryNext, type OrderStatus } from "@/lib/order-status";
import { useChime, useLiveOrders } from "./live";

export interface PosProduct {
  id: string;
  name: string;
  priceCents: number;
  fromPriceCents: number;
  outOfStock: boolean;
  image: string | null;
  isExtra: boolean;
  categoryIds: string[];
  variants: { id: string; label: string; priceCents: number; outOfStock: boolean }[];
  optionGroups: { id: string; name: string; minSelect: number; maxSelect: number; options: { id: string; name: string; priceDeltaCents: number }[] }[];
}
interface Category { id: string; name: string; kind: string; productIds: string[] }
interface Line { key: string; productId: string; variantId: string | null; optionIds: string[]; quantity: number; name: string; detail: string; unitCents: number }
type Method = "CASH" | "CARD_TERMINAL" | "MEAL_VOUCHER_PAPER" | "MEAL_VOUCHER_CARD";
interface Customer { id: string; firstName: string; lastName: string; phone: string; cardNumber: string | null; points: number }
type Discount = { type: "PERCENT" | "AMOUNT"; value: number } | null;

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
const parseEur = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const METHODS: { id: Method; label: string; icon: string }[] = [
  { id: "CASH", label: "Espèces", icon: "💶" },
  { id: "CARD_TERMINAL", label: "Carte (TPE)", icon: "💳" },
  { id: "MEAL_VOUCHER_CARD", label: "Titre-resto carte", icon: "🎫" },
  { id: "MEAL_VOUCHER_PAPER", label: "Titre-resto papier", icon: "🧾" },
];
const SETTINGS_KEY = "yaoma-pos-settings";

function useSettings() {
  const [s, setS] = useState({ printerId: "", autoReceipt: false, sendToKitchen: true });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved) setS((x) => ({ ...x, ...saved }));
    } catch {}
  }, []);
  const update = (patch: Partial<typeof s>) => setS((x) => {
    const next = { ...x, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  return [s, update] as const;
}

/** Caisse tactile : gros boutons, un ticket à droite, l'encaissement en deux touches. */
export function PosScreen(props: {
  restaurantId: string; restaurantName: string; seller: string; categories: Category[]; products: PosProduct[];
  printers: { id: string; name: string }[]; modes: { dineIn: boolean; pickup: boolean }; canRefund: boolean; canUpdate: boolean;
}) {
  const { restaurantId, categories, products, printers } = props;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [settings, setSettings] = useSettings();
  const [cat, setCat] = useState(categories[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"DINE_IN" | "PICKUP">(props.modes.dineIn ? "DINE_IN" : "PICKUP");
  const [table, setTable] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState<Discount>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [picking, setPicking] = useState<PosProduct | null>(null);
  const [panel, setPanel] = useState<null | "pay" | "discount" | "customer" | "online" | "today" | "settings" | "note">(null);
  const [done, setDone] = useState<null | { orderId: string; number: number; dailyNumber: number; totalCents: number; changeCents: number; receipt: boolean }>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ totalCents: number; discountCents: number; extrasDiscountCents: number; error?: string } | null>(null);

  const chime = useChime();
  const { orders, connected, reload } = useLiveOrders(restaurantId, { onNew: (o) => { if ((o as { source?: string }).source !== "POS") chime.play(); } });
  const online = (orders ?? []).filter((o) => (o as { source?: string }).source !== "POS" && ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(o.status));
  const newOnline = online.filter((o) => o.status === "NEW").length;

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const payload = useCallback(() => ({
    restaurantId, mode, lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, optionIds: l.optionIds, quantity: l.quantity })),
    discount: discount ?? undefined,
  }), [restaurantId, mode, lines, discount]);

  // Montants exacts calculés par le serveur (petits plus offerts, remise) : le total affiché est celui encaissé.
  const estimate = lines.reduce((a, l) => a + l.unitCents * l.quantity, 0);
  useEffect(() => {
    if (!lines.length) { setPreview(null); return; }
    const id = setTimeout(() => {
      posPreviewAction(payload()).then((r) => setPreview(r.ok ? r : { totalCents: estimate, discountCents: 0, extrasDiscountCents: 0, error: r.message })).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [payload, lines.length, estimate]);
  const total = preview?.totalCents ?? estimate;

  const add = (p: PosProduct, variantId: string | null, optionIds: string[], quantity = 1) => {
    const v = p.variants.find((x) => x.id === variantId);
    const opts = p.optionGroups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    const unit = (v?.priceCents ?? p.priceCents) + opts.reduce((a, o) => a + o.priceDeltaCents, 0);
    const key = `${p.id}|${variantId ?? ""}|${[...optionIds].sort().join(",")}`;
    setLines((ls) => {
      const found = ls.find((l) => l.key === key);
      if (found) return ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      return [...ls, { key, productId: p.id, variantId, optionIds, quantity, name: p.name, detail: [v?.label, ...opts.map((o) => o.name)].filter(Boolean).join(" · "), unitCents: unit }];
    });
  };
  const tap = (p: PosProduct) => {
    if (p.outOfStock) return;
    if (p.variants.length > 1 || p.optionGroups.length) setPicking(p);
    else add(p, p.variants[0]?.id ?? null, []);
  };
  const reset = () => { setLines([]); setDiscount(null); setCustomer(null); setTable(""); setNotes(""); setPreview(null); };

  const visible = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : (categories.find((c) => c.id === cat)?.productIds ?? []).map((id) => byId.get(id)!).filter(Boolean);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-100 text-ink select-none">
      {/* Barre du haut */}
      <header className="flex flex-wrap items-center gap-2 bg-ink px-3 py-2 text-white">
        <span className="font-display text-2xl">{props.restaurantName}</span>
        <span className="text-sm text-white/60">Caisse · {props.seller}</span>
        <div className="ml-2 flex overflow-hidden rounded-xl bg-white/10">
          {props.modes.dineIn && <button type="button" onClick={() => setMode("DINE_IN")} className={`px-4 py-2 font-bold ${mode === "DINE_IN" ? "bg-brand-600" : ""}`}>Sur place</button>}
          {props.modes.pickup && <button type="button" onClick={() => setMode("PICKUP")} className={`px-4 py-2 font-bold ${mode === "PICKUP" ? "bg-brand-600" : ""}`}>À emporter</button>}
        </div>
        {mode === "DINE_IN" && (
          <input value={table} onChange={(e) => setTable(e.target.value.slice(0, 20))} placeholder="Table" inputMode="numeric"
            className="w-20 rounded-xl bg-white/10 px-3 py-2 text-center font-bold placeholder:text-white/50" />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!chime.enabled && <button type="button" onClick={chime.enable} className="rounded-xl bg-amber-400 px-3 py-2 font-bold text-ink">🔔 Son</button>}
          <button type="button" onClick={() => setPanel("online")} className={`relative rounded-xl px-4 py-2 font-bold ${newOnline ? "animate-pulse bg-brand-600" : "bg-white/10"}`}>
            🌐 Commandes en ligne {online.length > 0 && <span className="ml-1 rounded-full bg-white px-2 text-ink">{online.length}</span>}
            <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
          </button>
          <button type="button" onClick={() => setPanel("today")} className="rounded-xl bg-white/10 px-4 py-2 font-bold">🧾 Tickets du jour</button>
          <button type="button" onClick={() => setPanel("settings")} className="rounded-xl bg-white/10 px-3 py-2 font-bold" aria-label="Réglages">⚙️</button>
          <Link href="/admin" className="rounded-xl bg-white/10 px-3 py-2 font-bold">Quitter</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Catalogue */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-2 overflow-x-auto bg-white px-2 py-2 shadow-sm">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Chercher" className="w-36 shrink-0 rounded-xl border border-neutral-300 px-3 py-2" />
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => { setCat(c.id); setSearch(""); }}
                className={`shrink-0 rounded-xl px-4 py-3 text-lg font-bold ${cat === c.id && !search ? "bg-ink text-white" : "bg-neutral-100"}`}>{c.name}</button>
            ))}
          </div>
          <div className="grid flex-1 auto-rows-min gap-2 overflow-y-auto p-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {visible.map((p) => (
              <button key={p.id} type="button" onClick={() => tap(p)} disabled={p.outOfStock}
                className={`relative flex min-h-28 flex-col justify-between overflow-hidden rounded-2xl p-3 text-left shadow-sm active:scale-95 ${p.outOfStock ? "bg-neutral-200 text-neutral-400" : "bg-white"}`}>
                {p.image && <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
                <span className="relative text-lg font-bold leading-tight">{p.name}</span>
                <span className="relative mt-2 flex items-end justify-between">
                  <span className="text-xl font-extrabold">{p.variants.length > 1 ? `dès ${eur(p.fromPriceCents)}` : eur(p.variants[0]?.priceCents ?? p.priceCents)}</span>
                  {p.outOfStock && <span className="rounded bg-red-600 px-2 text-xs font-bold text-white">RUPTURE</span>}
                  {!p.outOfStock && (p.variants.length > 1 || p.optionGroups.length > 0) && <span className="text-xs text-neutral-500">choix ›</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Ticket */}
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-neutral-300 bg-white">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="font-display text-xl">Ticket</span>
            <span className="text-sm text-neutral-500">{MODE_LABELS[mode]}{table && mode === "DINE_IN" ? ` · Table ${table}` : ""}</span>
            {lines.length > 0 && <button type="button" onClick={reset} className="ml-auto rounded-lg bg-neutral-100 px-3 py-1 text-sm font-bold text-red-700">Vider</button>}
          </div>
          <ul className="flex-1 divide-y overflow-y-auto">
            {lines.length === 0 && <li className="p-6 text-center text-neutral-400">Touchez un produit pour l&apos;ajouter.</li>}
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 px-3 py-2">
                <div className="flex items-center gap-1">
                  <button type="button" className="h-10 w-10 rounded-lg bg-neutral-100 text-xl font-bold" onClick={() => setLines((ls) => ls.flatMap((x) => (x.key === l.key ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x])))}>−</button>
                  <span className="w-7 text-center text-lg font-bold">{l.quantity}</span>
                  <button type="button" className="h-10 w-10 rounded-lg bg-neutral-100 text-xl font-bold" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x)))}>+</button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.name}</p>
                  {l.detail && <p className="truncate text-xs text-neutral-500">{l.detail}</p>}
                </div>
                <span className="font-bold">{eur(l.unitCents * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t p-3">
            <div className="grid grid-cols-3 gap-2 text-sm font-bold">
              <button type="button" onClick={() => setPanel("customer")} className={`rounded-xl px-2 py-3 ${customer ? "bg-amber-100 text-amber-900" : "bg-neutral-100"}`}>{customer ? `⭐ ${customer.firstName || "Client"}` : "⭐ Fidélité"}</button>
              <button type="button" onClick={() => setPanel("discount")} className={`rounded-xl px-2 py-3 ${discount ? "bg-green-100 text-green-900" : "bg-neutral-100"}`}>{discount ? `Remise ${discount.type === "PERCENT" ? `${discount.value} %` : eur(discount.value)}` : "％ Remise"}</button>
              <button type="button" onClick={() => setPanel("note")} className={`rounded-xl px-2 py-3 ${notes ? "bg-sky-100 text-sky-900" : "bg-neutral-100"}`}>✏️ Note</button>
            </div>
            {preview?.extrasDiscountCents ? <p className="flex justify-between text-sm"><span>Petits plus offerts</span><span>−{eur(preview.extrasDiscountCents)}</span></p> : null}
            {preview?.discountCents ? <p className="flex justify-between text-sm"><span>Remise</span><span>−{eur(preview.discountCents)}</span></p> : null}
            {preview?.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{preview.error}</p>}
            <p className="flex items-baseline justify-between"><span className="text-lg font-bold">Total</span><span className="font-display text-4xl">{eur(total)}</span></p>
            <button type="button" disabled={!lines.length || !!preview?.error} onClick={() => setPanel("pay")}
              className="w-full rounded-2xl bg-green-600 py-5 text-2xl font-extrabold text-white disabled:bg-neutral-300">Encaisser</button>
          </div>
        </aside>
      </div>

      {picking && <ProductPicker product={picking} onClose={() => setPicking(null)} onAdd={(v, o, q) => { add(picking, v, o, q); setPicking(null); }} />}
      {panel === "pay" && (
        <PayPanel total={total} settings={settings} onClose={() => setPanel(null)}
          onPay={async (payments, printReceipt) => {
            const r = await posSaleAction({
              ...payload(), table: mode === "DINE_IN" ? table : "", notes, customerId: customer?.id ?? null, payments,
              sendToKitchen: settings.sendToKitchen, receiptPrinterId: settings.printerId || null, printReceipt,
            });
            if (!r.ok) return r.message;
            setPanel(null);
            setDone({ orderId: r.orderId, number: r.number, dailyNumber: r.dailyNumber, totalCents: r.totalCents, changeCents: r.changeCents, receipt: printReceipt && !!settings.printerId });
            reset();
            return null;
          }} />
      )}
      {panel === "discount" && <DiscountPanel value={discount} onClose={() => setPanel(null)} onSave={(d) => { setDiscount(d); setPanel(null); }} />}
      {panel === "note" && (
        <Modal title="Note pour la cuisine" onClose={() => setPanel(null)}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} rows={4} className="w-full rounded-xl border p-3 text-lg" placeholder="Sans wasabi, allergie…" autoFocus />
          <button type="button" onClick={() => setPanel(null)} className="mt-3 w-full rounded-xl bg-ink py-4 text-lg font-bold text-white">OK</button>
        </Modal>
      )}
      {panel === "customer" && <CustomerPanel restaurantId={restaurantId} current={customer} onClose={() => setPanel(null)} onPick={(c) => { setCustomer(c); setPanel(null); }} />}
      {panel === "online" && <OnlinePanel orders={online} canUpdate={props.canUpdate} reload={reload} onClose={() => setPanel(null)} />}
      {panel === "today" && <TodayPanel restaurantId={restaurantId} printerId={settings.printerId} canRefund={props.canRefund} onClose={() => setPanel(null)} flash={flash} />}
      {panel === "settings" && <SettingsPanel restaurantId={restaurantId} printers={printers} settings={settings} update={setSettings} onClose={() => setPanel(null)} flash={flash} />}

      {done && (
        <Modal title="Vente enregistrée" onClose={() => setDone(null)}>
          <div className="space-y-3 text-center">
            <p className="text-lg">Ticket n° {done.number} · commande n° <b>{done.dailyNumber}</b></p>
            <p className="font-display text-5xl">{eur(done.totalCents)}</p>
            {done.changeCents > 0 && <p className="rounded-2xl bg-amber-100 p-4 text-3xl font-extrabold text-amber-900">Rendu : {eur(done.changeCents)}</p>}
            {done.receipt ? <p className="text-neutral-600">Ticket client envoyé à l&apos;imprimante.</p> : settings.printerId && (
              <button type="button" className="w-full rounded-xl bg-neutral-100 py-4 text-lg font-bold"
                onClick={async () => { const r = await posReceiptAction(done.orderId, settings.printerId); flash(r.message); setDone({ ...done, receipt: r.ok }); }}>🧾 Imprimer le ticket client</button>
            )}
            <button type="button" onClick={() => setDone(null)} className="w-full rounded-2xl bg-green-600 py-5 text-2xl font-extrabold text-white" autoFocus>Nouvelle vente</button>
          </div>
        </Modal>
      )}
      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-5 py-3 font-bold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className={`max-h-[94dvh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="h-11 w-11 rounded-full bg-neutral-100 text-xl" aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProductPicker({ product: p, onClose, onAdd }: { product: PosProduct; onClose: () => void; onAdd: (variantId: string | null, optionIds: string[], qty: number) => void }) {
  const [variant, setVariant] = useState<string | null>(p.variants.find((v) => !v.outOfStock)?.id ?? null);
  const [opts, setOpts] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const toggle = (gId: string, oId: string) => {
    const g = p.optionGroups.find((x) => x.id === gId)!;
    setOpts((cur) => {
      if (cur.includes(oId)) return cur.filter((x) => x !== oId);
      const inGroup = cur.filter((x) => g.options.some((o) => o.id === x));
      if (g.maxSelect === 1) return [...cur.filter((x) => !inGroup.includes(x)), oId];
      if (g.maxSelect > 0 && inGroup.length >= g.maxSelect) return cur;
      return [...cur, oId];
    });
  };
  const missing = p.optionGroups.find((g) => g.options.filter((o) => opts.includes(o.id)).length < g.minSelect);
  const unit = (p.variants.find((v) => v.id === variant)?.priceCents ?? p.priceCents) + p.optionGroups.flatMap((g) => g.options).filter((o) => opts.includes(o.id)).reduce((a, o) => a + o.priceDeltaCents, 0);
  return (
    <Modal title={p.name} onClose={onClose}>
      {p.variants.length > 1 && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {p.variants.map((v) => (
            <button key={v.id} type="button" disabled={v.outOfStock} onClick={() => setVariant(v.id)}
              className={`rounded-xl p-4 text-left font-bold ${variant === v.id ? "bg-ink text-white" : "bg-neutral-100"} disabled:opacity-40`}>
              {v.label}<span className="block text-lg">{eur(v.priceCents)}</span>
            </button>
          ))}
        </div>
      )}
      {p.optionGroups.map((g) => (
        <div key={g.id} className="mb-4">
          <p className="mb-2 font-bold">{g.name} <span className="text-sm font-normal text-neutral-500">{g.minSelect > 0 ? `(obligatoire${g.maxSelect > 1 ? `, jusqu'à ${g.maxSelect}` : ""})` : g.maxSelect > 0 ? `(jusqu'à ${g.maxSelect})` : ""}</span></p>
          <div className="grid grid-cols-2 gap-2">
            {g.options.map((o) => (
              <button key={o.id} type="button" onClick={() => toggle(g.id, o.id)}
                className={`rounded-xl p-3 text-left font-semibold ${opts.includes(o.id) ? "bg-brand-600 text-white" : "bg-neutral-100"}`}>
                {o.name}{o.priceDeltaCents ? <span className="block text-sm">+{eur(o.priceDeltaCents)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" className="h-14 w-14 rounded-xl bg-neutral-100 text-2xl font-bold" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
        <span className="w-8 text-center text-2xl font-bold">{qty}</span>
        <button type="button" className="h-14 w-14 rounded-xl bg-neutral-100 text-2xl font-bold" onClick={() => setQty((q) => q + 1)}>+</button>
        <button type="button" disabled={!!missing || (p.variants.length > 0 && !variant)} onClick={() => onAdd(variant, opts, qty)}
          className="flex-1 rounded-2xl bg-green-600 py-4 text-xl font-extrabold text-white disabled:bg-neutral-300">
          {missing ? `Choisir : ${missing.name}` : `Ajouter · ${eur(unit * qty)}`}
        </button>
      </div>
    </Modal>
  );
}

function PayPanel({ total, settings, onClose, onPay }: {
  total: number; settings: { printerId: string; autoReceipt: boolean };
  onClose: () => void; onPay: (payments: { method: Method; amountCents: number }[], printReceipt: boolean) => Promise<string | null>;
}) {
  const [payments, setPayments] = useState<{ method: Method; amountCents: number }[]>([]);
  const [method, setMethod] = useState<Method>("CASH");
  const [typed, setTyped] = useState("");
  const [receipt, setReceipt] = useState(settings.autoReceipt);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const paid = payments.reduce((a, p) => a + p.amountCents, 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const quick = [...new Set([remaining, ...[500, 1000, 2000, 5000, 10000].filter((n) => n > remaining).slice(0, 3)])].filter((n) => n > 0);
  const push = (amount: number) => {
    if (amount <= 0) return;
    setPayments((ps) => [...ps, { method, amountCents: method === "CASH" ? amount : Math.min(amount, remaining) }]);
    setTyped("");
  };
  const submit = (list = payments) => start(async () => {
    setError("");
    const err = await onPay(list, receipt);
    if (err) setError(err);
  });
  const key = (k: string) => setTyped((t) => (k === "⌫" ? t.slice(0, -1) : k === "," ? (t.includes(",") ? t : `${t || "0"},`) : (t + k).replace(/^0(\d)/, "$1")).slice(0, 8));
  return (
    <Modal title="Encaissement" onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-2xl bg-ink p-4 text-white">
            <p className="text-sm text-white/70">À payer</p>
            <p className="font-display text-5xl">{eur(total)}</p>
            {paid > 0 && <p className="mt-2 text-lg">{remaining > 0 ? `Reste : ${eur(remaining)}` : change > 0 ? `Rendu : ${eur(change)}` : "Payé"}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button key={m.id} type="button" onClick={() => setMethod(m.id)} className={`rounded-xl p-3 text-lg font-bold ${method === m.id ? "bg-brand-600 text-white" : "bg-neutral-100"}`}>{m.icon} {m.label}</button>
            ))}
          </div>
          {/* Paiement exact en une touche (le cas le plus courant) */}
          {payments.length === 0 && (
            <button type="button" disabled={pending} onClick={() => submit([{ method, amountCents: total }])}
              className="w-full rounded-2xl bg-green-600 py-5 text-2xl font-extrabold text-white">
              {pending ? "Enregistrement…" : `${METHODS.find((m) => m.id === method)!.label} · ${eur(total)} exact`}
            </button>
          )}
          {payments.length > 0 && (
            <ul className="space-y-1">
              {payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2">
                  <span>{PAYMENT_METHOD_LABELS[p.method]}</span>
                  <span className="font-bold">{eur(p.amountCents)} <button type="button" className="ml-2 text-red-700" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}>✕</button></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-neutral-600">{method === "CASH" ? "Montant reçu" : "Montant de ce règlement (paiement partagé)"}</p>
          <div className="flex flex-wrap gap-2">
            {quick.map((n) => <button key={n} type="button" onClick={() => push(n)} className="rounded-xl bg-neutral-100 px-4 py-3 text-lg font-bold">{eur(n)}</button>)}
          </div>
          <div className="rounded-xl border-2 border-neutral-300 px-4 py-3 text-right font-display text-3xl">{typed ? `${typed} €` : "—"}</div>
          <div className="grid grid-cols-3 gap-2">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"].map((k) => (
              <button key={k} type="button" onClick={() => key(k)} className="rounded-xl bg-neutral-100 py-4 text-2xl font-bold active:bg-neutral-300">{k}</button>
            ))}
          </div>
          <button type="button" disabled={!typed} onClick={() => push(parseEur(typed))} className="w-full rounded-xl bg-ink py-3 text-lg font-bold text-white disabled:bg-neutral-300">Ajouter ce règlement</button>
        </div>
      </div>
      <label className="mt-4 flex items-center gap-3 text-lg">
        <input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} className="h-6 w-6" disabled={!settings.printerId} />
        Imprimer le ticket client {!settings.printerId && <span className="text-sm text-neutral-500">(choisissez l&apos;imprimante dans ⚙️)</span>}
      </label>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p>}
      {payments.length > 0 && (
        <button type="button" disabled={pending || remaining > 0} onClick={() => submit()}
          className="mt-4 w-full rounded-2xl bg-green-600 py-5 text-2xl font-extrabold text-white disabled:bg-neutral-300">
          {pending ? "Enregistrement…" : remaining > 0 ? `Reste ${eur(remaining)}` : `Valider${change ? ` · rendre ${eur(change)}` : ""}`}
        </button>
      )}
    </Modal>
  );
}

function DiscountPanel({ value, onClose, onSave }: { value: Discount; onClose: () => void; onSave: (d: Discount) => void }) {
  const [type, setType] = useState<"PERCENT" | "AMOUNT">(value?.type ?? "PERCENT");
  const [typed, setTyped] = useState(value ? (value.type === "PERCENT" ? String(value.value) : (value.value / 100).toFixed(2).replace(".", ",")) : "");
  const n = type === "PERCENT" ? Math.min(100, Math.round(Number(typed.replace(",", ".")) || 0)) : parseEur(typed);
  return (
    <Modal title="Remise" onClose={onClose}>
      <div className="mb-3 flex overflow-hidden rounded-xl bg-neutral-100">
        <button type="button" onClick={() => setType("PERCENT")} className={`flex-1 py-3 font-bold ${type === "PERCENT" ? "bg-ink text-white" : ""}`}>En %</button>
        <button type="button" onClick={() => setType("AMOUNT")} className={`flex-1 py-3 font-bold ${type === "AMOUNT" ? "bg-ink text-white" : ""}`}>En €</button>
      </div>
      {type === "PERCENT" && (
        <div className="mb-3 grid grid-cols-4 gap-2">
          {[5, 10, 20, 50].map((p) => <button key={p} type="button" onClick={() => setTyped(String(p))} className="rounded-xl bg-neutral-100 py-3 text-lg font-bold">{p} %</button>)}
        </div>
      )}
      <input value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^\d,.]/g, "").slice(0, 8))} inputMode="decimal" autoFocus
        className="w-full rounded-xl border-2 p-3 text-center font-display text-3xl" placeholder={type === "PERCENT" ? "10" : "5,00"} />
      <div className="mt-4 flex gap-2">
        {value && <button type="button" onClick={() => onSave(null)} className="flex-1 rounded-xl bg-neutral-100 py-4 font-bold text-red-700">Retirer</button>}
        <button type="button" disabled={n <= 0} onClick={() => onSave({ type, value: n })} className="flex-1 rounded-xl bg-green-600 py-4 text-lg font-bold text-white disabled:bg-neutral-300">Appliquer</button>
      </div>
    </Modal>
  );
}

function CustomerPanel({ restaurantId, current, onClose, onPick }: { restaurantId: string; current: Customer | null; onClose: () => void; onPick: (c: Customer | null) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Customer | null | undefined>(undefined);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const look = () => start(async () => setFound(await posFindCustomerAction(restaurantId, q)));
  return (
    <Modal title="Carte de fidélité" onClose={onClose}>
      <p className="mb-2 text-neutral-600">Scannez la carte (douchette) ou tapez le n° de carte ou le téléphone du client.</p>
      <form onSubmit={(e) => { e.preventDefault(); look(); }} className="flex gap-2">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} autoFocus inputMode="numeric" className="flex-1 rounded-xl border-2 p-3 text-xl" placeholder="N° de carte ou téléphone" />
        <button type="submit" disabled={pending || q.replace(/\s/g, "").length < 6} className="rounded-xl bg-ink px-5 font-bold text-white disabled:bg-neutral-300">{pending ? "…" : "Chercher"}</button>
      </form>
      {found === null && <p className="mt-3 rounded-xl bg-neutral-100 p-3">Aucun client trouvé.</p>}
      {found && (
        <button type="button" onClick={() => onPick(found)} className="mt-3 w-full rounded-2xl bg-amber-100 p-4 text-left">
          <span className="block text-xl font-bold">{found.firstName} {found.lastName}</span>
          <span className="block text-amber-900">{found.points} points · {found.phone}{found.cardNumber ? ` · carte ${found.cardNumber}` : ""}</span>
          <span className="mt-2 block font-bold">Associer à ce ticket ›</span>
        </button>
      )}
      {current && <button type="button" onClick={() => onPick(null)} className="mt-3 w-full rounded-xl bg-neutral-100 py-3 font-bold text-red-700">Retirer {current.firstName} du ticket</button>}
      <p className="mt-3 text-sm text-neutral-500">Les points sont crédités quand la commande est remise (terminée).</p>
    </Modal>
  );
}

function OnlinePanel({ orders, canUpdate, reload, onClose }: { orders: ReturnType<typeof useLiveOrders>["orders"] & object; canUpdate: boolean; reload: () => Promise<void>; onClose: () => void }) {
  const [pending, start] = useTransition();
  const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return (
    <Modal title="Commandes en ligne" onClose={onClose} wide>
      {orders.length === 0 ? <p className="py-8 text-center text-neutral-500">Aucune commande en ligne en cours.</p> : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const next = primaryNext(o.status as OrderStatus, o.mode);
            return (
              <li key={o.id} className={`rounded-2xl p-4 ${o.status === "NEW" ? "bg-brand-50 ring-2 ring-brand-500" : "bg-neutral-100"}`}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-4xl">{o.dailyNumber}</span>
                  <span className="font-bold">{MODE_LABELS[o.mode]} · {time(o.slotStart)}</span>
                  <span className="text-neutral-600">{o.customerName} · {o.customerPhone}</span>
                  <span className="ml-auto font-bold">{eur(o.totalCents)} · {o.paymentStatus === "PAID" ? "payée" : "à encaisser"}</span>
                </div>
                <p className="mt-1 text-sm">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
                {o.notes && <p className="mt-1 text-sm font-semibold">Note : {o.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-bold">{STATUS_LABELS[o.status as OrderStatus]}</span>
                  {canUpdate && next && (
                    <button type="button" disabled={pending} onClick={() => start(async () => { await setOrderStatus(o.id, next); await reload(); })}
                      className="rounded-xl bg-ink px-4 py-2 font-bold text-white">→ {STATUS_LABELS[next]}</button>
                  )}
                  <Link href={`/admin/commandes/${o.id}`} className="rounded-xl bg-white px-4 py-2 font-bold">Détail / encaisser</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function TodayPanel({ restaurantId, printerId, canRefund, onClose, flash }: { restaurantId: string; printerId: string; canRefund: boolean; onClose: () => void; flash: (m: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof posTodayAction>> | null>(null);
  useEffect(() => { posTodayAction(restaurantId).then(setData).catch(() => {}); }, [restaurantId]);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return (
    <Modal title="Tickets du jour" onClose={onClose} wide>
      {!data ? <p>Chargement…</p> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-xl bg-ink p-3 text-white"><p className="text-xs text-white/70">Total caisse</p><p className="text-2xl font-bold">{eur(data.total)}</p></div>
            {Object.entries(data.byMethod).map(([m, c]) => (
              <div key={m} className="rounded-xl bg-neutral-100 p-3"><p className="text-xs text-neutral-600">{PAYMENT_METHOD_LABELS[m as Method]}</p><p className="text-xl font-bold">{eur(c)}</p></div>
            ))}
          </div>
          <ul className="divide-y">
            {data.tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 font-bold">n° {t.number}</span>
                <span className="text-neutral-600">{time(t.at)}</span>
                <span className="text-neutral-600">{t.customer}</span>
                {t.status === "CANCELLED" && <span className="rounded bg-red-100 px-2 text-sm font-bold text-red-700">annulé</span>}
                <span className="ml-auto font-bold">{eur(t.totalCents)}</span>
                {printerId && <button type="button" className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-bold" onClick={async () => flash((await posReprintAction(t.id, printerId)).message)}>Duplicata</button>}
                {canRefund && <Link href={`/admin/commandes/${t.id}`} className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-bold">Avoir…</Link>}
              </li>
            ))}
            {data.tickets.length === 0 && <li className="py-6 text-center text-neutral-500">Aucune vente au comptoir aujourd&apos;hui.</li>}
          </ul>
          <p className="mt-4 text-sm text-neutral-500">Une vente ne se modifie pas : en cas d&apos;erreur, faites un avoir (remboursement). La clôture du jour (Z) se fait dans Comptabilité.</p>
        </>
      )}
    </Modal>
  );
}

function SettingsPanel({ restaurantId, printers, settings, update, onClose, flash }: {
  restaurantId: string; printers: { id: string; name: string }[]; settings: { printerId: string; autoReceipt: boolean; sendToKitchen: boolean };
  update: (p: Partial<{ printerId: string; autoReceipt: boolean; sendToKitchen: boolean }>) => void; onClose: () => void; flash: (m: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Réglages de cette caisse" onClose={onClose}>
      <label className="block font-semibold">Imprimante des tickets clients et du tiroir-caisse</label>
      <select value={settings.printerId} onChange={(e) => update({ printerId: e.target.value })} className="mt-1 w-full rounded-xl border-2 p-3 text-lg">
        <option value="">— Aucune —</option>
        {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label className="mt-4 flex items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6" checked={settings.autoReceipt} onChange={(e) => update({ autoReceipt: e.target.checked })} /> Ticket client coché par défaut</label>
      <label className="mt-2 flex items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6" checked={settings.sendToKitchen} onChange={(e) => update({ sendToKitchen: e.target.checked })} /> Envoyer les ventes en cuisine (ticket de préparation, écran cuisine)</label>
      <p className="mt-2 text-sm text-neutral-500">Depuis août 2023, le ticket n&apos;est imprimé que si le client le demande.</p>
      <div className="mt-5 rounded-2xl bg-neutral-100 p-3">
        <p className="font-semibold">Ouvrir le tiroir sans vente</p>
        <div className="mt-2 flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Motif (fond de caisse, monnaie…)" className="flex-1 rounded-xl border p-3" />
          <button type="button" disabled={!settings.printerId || !reason.trim()} onClick={async () => { const r = await posDrawerAction(restaurantId, settings.printerId, reason); flash(r.message); if (r.ok) setReason(""); }}
            className="rounded-xl bg-ink px-4 font-bold text-white disabled:bg-neutral-300">Ouvrir</button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Chaque ouverture est notée dans le journal.</p>
      </div>
      <button type="button" className="mt-4 w-full rounded-xl bg-neutral-100 py-3 font-bold" onClick={() => document.documentElement.requestFullscreen?.()}>Plein écran</button>
    </Modal>
  );
}
