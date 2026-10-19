"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BadgeDef } from "@/lib/config-schema";
import { BadgeChip } from "../site/BadgeChip";
import { useI18n } from "@/i18n/client";
import { pauseUntilText } from "@/lib/pause";
import { money } from "@/lib/money";
import { CartPanel } from "./CartPanel";
import { useCart } from "./cart-store";
import { ProductDialog } from "./ProductDialog";
import type { ClientCategory, ClientProduct, ClientRestaurant } from "./types";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function OrderMenu({
  restaurant,
  categories,
  products,
  extrasLabel,
  multiRestaurant = false,
  badges,
  searchExamples = "",
  extrasHint = "",
  translated = false,
}: {
  badges: BadgeDef[];
  searchExamples?: string;
  extrasHint?: string;
  translated?: boolean;
  restaurant: ClientRestaurant;
  categories: ClientCategory[];
  products: ClientProduct[];
  extrasLabel: string;
  multiRestaurant?: boolean;
}) {
  const { t, locale } = useI18n();
  const cart = useCart(restaurant.slug);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ClientProduct | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const [toast, setToast] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  const extras = useMemo(
    () => categories.filter((c) => c.kind === "EXTRAS").flatMap((c) => c.productIds.map((id) => byId.get(id)!).filter(Boolean)),
    [categories, byId],
  );

  // Mémorise le restaurant choisi (sélecteur multi-restaurant).
  useEffect(() => {
    document.cookie = `ys_resto=${restaurant.slug}; path=/; max-age=31536000; samesite=lax`;
  }, [restaurant.slug]);

  // Lien direct vers un produit (?produit=<slug>, ex. anciennes URL WordPress) : ouvre sa fiche.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("produit");
    const p = slug ? products.find((x) => x.slug === slug) : undefined;
    if (p && !p.outOfStock) setOpen(p);
  }, [products]);

  // Catégorie active selon le défilement.
  useEffect(() => {
    if (query) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace(/^cat-/, ""));
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    document.querySelectorAll("[data-category]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [query, categories]);

  // Garde la catégorie active visible dans la barre.
  useEffect(() => {
    barRef.current?.querySelector(`[data-chip="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return null;
    return products.filter((p) => normalize(`${p.name} ${p.shortDescription}`).includes(q));
  }, [query, products]);

  const count = cart.items.reduce((s, i) => s + i.quantity, 0);
  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1800);
  };

  const quickAdd = (p: ClientProduct) => {
    if (p.variants.length > 0 || p.optionGroups.length > 0) return setOpen(p);
    cart.add(p.id, null, [], 1);
    notify(t("menu.added", { name: p.name }));
  };

  const card = (p: ClientProduct) => (
    <li key={p.id} className={`card flex overflow-hidden ${p.outOfStock ? "opacity-55 grayscale" : ""}`}>
      <button type="button" onClick={() => !p.outOfStock && setOpen(p)} disabled={p.outOfStock}
        className="flex min-w-0 flex-1 gap-3 p-3 text-start disabled:cursor-not-allowed" aria-label={`${p.name}, ${money(p.fromPriceCents)}${p.outOfStock ? `, ${t("menu.outOfStock")}` : ""}`}>
        {p.image ? (
          <img src={p.image.src} srcSet={p.image.srcSet} sizes="112px" alt="" loading="lazy" width={112} height={112}
            className="h-24 w-24 shrink-0 rounded-2xl bg-linen object-cover sm:h-28 sm:w-28" />
        ) : <div className="h-24 w-24 shrink-0 rounded-2xl bg-linen sm:h-28 sm:w-28" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-medium leading-snug">{p.name}</span>
          {p.badges.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {p.badges.map((b) => <BadgeChip key={b} code={b} badges={badges} />)}
            </span>
          )}
          {(!p.availableLunch || !p.availableDinner) && (
            <span className="mt-1 text-xs font-semibold text-brand-700">{p.availableLunch ? t("menu.lunchOnly") : t("menu.dinnerOnly")}</span>
          )}
          {p.shortDescription && <span className="mt-1 line-clamp-2 text-sm text-muted">{p.shortDescription.replace(/\n/g, ", ")}</span>}
          <span className="mt-auto pt-1 font-semibold">
            {p.outOfStock ? <span className="text-red-700">{t("menu.outOfStock")}</span> : p.variants.length > 1 ? t("menu.from", { price: money(p.fromPriceCents) }) : money(p.fromPriceCents)}
          </span>
        </span>
      </button>
      {!p.outOfStock && (
        <button type="button" onClick={() => quickAdd(p)} className="m-3 ms-0 flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-full bg-brand-500 text-2xl font-bold text-ink hover:bg-brand-400"
          aria-label={p.variants.length || p.optionGroups.length ? t("menu.choose", { name: p.name }) : t("menu.add", { name: p.name })}>+</button>
      )}
    </li>
  );

  return (
    <div className="wrap lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
      <div className="min-w-0">
        <div className="pb-3 pt-8">
          <p className="eyebrow">{restaurant.name}</p>
          <h1 className="mt-2 text-5xl leading-none">{t("nav.menu")}</h1>
          <p className="mt-2 text-muted">
            {restaurant.name} — {restaurant.street}, {restaurant.city}
            {multiRestaurant && <a href="/commander?choisir=1" className="ms-2 text-sm font-semibold underline">{t("menu.change")}</a>}
          </p>
          {translated && <p className="mt-1 text-xs text-neutral-500">{t("menu.translated")}</p>}
          {restaurant.paused && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 font-semibold text-red-800">
              {restaurant.pausedUntil ? t("pause.banner", { until: pauseUntilText(new Date(restaurant.pausedUntil), t, locale, restaurant.timezone) }) : t("menu.paused")}
              {restaurant.pausedReason && <span className="mt-1 block font-normal">{restaurant.pausedReason}</span>}
              <span className="mt-1 block font-normal">{t("menu.browse")}</span>
            </p>
          )}
        </div>

        <div className="sticky top-16 z-30 -mx-4 border-b border-line/70 bg-paper/95 px-4 pb-3 pt-3 backdrop-blur sm:top-[4.5rem] sm:-mx-6 sm:px-6">
          <label className="sr-only" htmlFor="menu-search">{t("menu.searchLabel")}</label>
          <input id="menu-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchExamples ? t("menu.searchPlaceholder", { examples: searchExamples }) : t("menu.searchLabel")} className="input mb-2" />
          {!results && (
            <div ref={barRef} className="no-scrollbar flex gap-2 overflow-x-auto" role="navigation" aria-label={t("menu.categories")}>
              {categories.map((c) => (
                <a key={c.id} href={`#cat-${c.slug}`} data-chip={c.slug}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${active === c.slug ? "bg-char text-paper" : "bg-white text-char ring-1 ring-line hover:ring-char/40"}`}>
                  {c.name}
                </a>
              ))}
            </div>
          )}
        </div>

        {results ? (
          <section className="py-4" aria-live="polite">
            <h2 className="mb-3 text-3xl">{t("menu.results", { n: results.length })}</h2>
            <ul className="grid gap-3 md:grid-cols-2">{results.map(card)}</ul>
          </section>
        ) : (
          categories.map((c) => (
            <section key={c.id} id={`cat-${c.slug}`} data-category className="pt-10" aria-labelledby={`h-${c.slug}`}>
              <h2 id={`h-${c.slug}`} className="text-4xl">{c.name}</h2>
              {c.description && <p className="mb-2 mt-1 text-muted">{c.description}</p>}
              <ul className="mt-5 grid gap-3 md:grid-cols-2">{c.productIds.map((id) => byId.get(id)).filter((p): p is ClientProduct => !!p).map(card)}</ul>
            </section>
          ))
        )}
        <div className="h-24 lg:h-0" />
      </div>

      <aside className="hidden lg:block">
        <div className="card sticky top-24 mt-8 h-[calc(100dvh-7.5rem)] overflow-hidden">
          <CartPanel slug={restaurant.slug} items={cart.items} products={byId} extras={extras} extrasLabel={extrasLabel} extrasHint={extrasHint} restaurantId={restaurant.id}
            onQuantity={cart.setQuantity} onAddExtra={(p) => cart.add(p.id, null, [], 1)} />
        </div>
      </aside>

      {/* Téléphone : bouton panier flottant + tiroir */}
      {count > 0 && (
        <button type="button" onClick={() => setDrawer(true)} className="btn-dark fixed inset-x-4 bottom-4 z-40 justify-between py-4 text-lg shadow-2xl lg:hidden">
          <span className="rounded-full bg-brand-500 px-2.5 text-ink">{count}</span>
          <span>{t("menu.viewCart")}</span>
          <span aria-hidden>→</span>
        </button>
      )}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("menu.cart")}>
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} aria-label={t("product.close")} />
          <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-3xl bg-white">
            <div className="h-[85dvh]">
              <CartPanel slug={restaurant.slug} items={cart.items} products={byId} extras={extras} extrasLabel={extrasLabel} extrasHint={extrasHint} restaurantId={restaurant.id}
                onQuantity={cart.setQuantity} onAddExtra={(p) => cart.add(p.id, null, [], 1)} onClose={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <ProductDialog
        badges={badges}
        product={open}
        onClose={() => setOpen(null)}
        onAdd={(variantId, optionIds, qty) => {
          if (!open) return;
          cart.add(open.id, variantId, optionIds, qty);
          notify(qty > 1 ? t("menu.addedQty", { qty, name: open.name }) : t("menu.added", { name: open.name }));
        }}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center">
        {toast && <p className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</p>}
      </div>
    </div>
  );
}
