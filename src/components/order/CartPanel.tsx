"use client";

import Link from "next/link";
import { useMemo } from "react";
import { priceCart } from "@/lib/cart";
import { errorText, useI18n } from "@/i18n/client";
import { euros } from "@/lib/money";
import type { CartItem } from "./cart-store";
import type { ClientProduct } from "./types";

/** Contenu du panier (colonne latérale sur ordinateur, tiroir sur téléphone). */
export function CartPanel({
  slug,
  items,
  products,
  extras,
  extrasLabel,
  extrasHint = "",
  restaurantId,
  onQuantity,
  onAddExtra,
  onClose,
}: {
  slug: string;
  items: CartItem[];
  products: Map<string, ClientProduct>;
  extras: ClientProduct[];
  extrasLabel: string;
  extrasHint?: string;
  restaurantId: string;
  onQuantity: (key: string, q: number) => void;
  onAddExtra: (p: ClientProduct) => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  // Même moteur de calcul que le serveur (sans les règles de livraison, vues à l'étape suivante).
  // Chaque ligne est calculée séparément : prix et éventuelle erreur propres à la ligne.
  const priced = useMemo(() => {
    const ctx = {
      restaurantId, mode: "PICKUP" as const, period: "LUNCH" as const, zone: null, pickupMinimumCents: 0,
      noAlcoholDelivery: false, promo: null, now: new Date(),
    };
    const byKey = new Map(items.map((i) => [i.key, priceCart([i], products, ctx)]));
    const subtotalCents = [...byKey.values()].reduce((s, r) => s + r.subtotalCents, 0);
    const hasErrors = [...byKey.values()].some((r) => !r.ok);
    return { byKey, subtotalCents, hasErrors };
  }, [items, products, restaurantId]);
  const inCart = new Set(items.map((i) => i.productId));
  const suggestions = extras.filter((p) => !inCart.has(p.id) && !p.outOfStock && p.variants.length === 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <h2 className="text-3xl leading-none">{t("cart.title")}</h2>
        {onClose && <button type="button" onClick={onClose} className="rounded-full p-2 text-2xl leading-none hover:bg-neutral-100" aria-label={t("cart.close")}>×</button>}
      </div>

      {items.length === 0 ? (
        <p className="p-5 text-neutral-600">{t("cart.empty")}</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-neutral-100 px-5">
            {items.map((item) => {
              const p = products.get(item.productId);
              const r = priced.byKey.get(item.key);
              const line = r?.lines[0];
              const err = r?.errors[0] ? errorText(t, r.errors[0]) : undefined;
              return (
                <li key={item.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{p?.name ?? t("cart.unavailable")}</p>
                      {line && (line.variantLabel || line.options.length > 0) && (
                        <p className="text-sm text-neutral-600">{[line.variantLabel, ...line.options.map((o) => o.name)].filter(Boolean).join(" · ")}</p>
                      )}
                      {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
                    </div>
                    <span className="shrink-0 font-semibold">{line ? euros(line.totalCents) : "—"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-neutral-300" role="group" aria-label={t("cart.quantityOf", { name: p?.name ?? "" })}>
                      <button type="button" className="h-9 w-9 text-xl" onClick={() => onQuantity(item.key, item.quantity - 1)} aria-label={t("product.less")}>−</button>
                      <span className="w-7 text-center font-semibold">{item.quantity}</span>
                      <button type="button" className="h-9 w-9 text-xl" onClick={() => onQuantity(item.key, item.quantity + 1)} aria-label={t("product.more")}>+</button>
                    </div>
                    <button type="button" className="text-sm text-neutral-500 underline" onClick={() => onQuantity(item.key, 0)}>{t("cart.remove")}</button>
                  </div>
                </li>
              );
            })}
          </ul>

          {suggestions.length > 0 && (
            <div className="mx-5 my-4 rounded-2xl bg-sand p-4">
              <p className="font-display text-2xl leading-none">{extrasLabel}</p>
              {extrasHint && <p className="mb-3 text-sm text-neutral-700">{extrasHint}</p>}
              <div className="flex flex-wrap gap-2">
                {suggestions.map((p) => (
                  <button key={p.id} type="button" onClick={() => onAddExtra(p)} className="rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold hover:border-brand-600">
                    + {p.name} <span className="font-normal text-neutral-600">{p.priceCents ? euros(p.priceCents) : t("cart.free")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t border-neutral-200 p-5">
          <div className="mb-3 flex items-center justify-between text-lg">
            <span>{t("cart.subtotal", { n: count })}</span>
            <strong>{euros(priced.subtotalCents)}</strong>
          </div>
          <Link
            href={`/commander/${slug}/valider`}
            aria-disabled={priced.hasErrors}
            className={`btn-primary w-full text-lg ${priced.hasErrors ? "pointer-events-none opacity-50" : ""}`}
          >
            {t("cart.checkout")}
          </Link>
          <p className="mt-2 text-center text-xs text-neutral-600">{t("cart.next")}</p>
        </div>
      )}
    </div>
  );
}
