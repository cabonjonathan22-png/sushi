"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Panier stocké dans le navigateur (par restaurant), partagé entre onglets.
 * Il ne contient que des identifiants et des quantités : les prix sont toujours
 * recalculés (affichage : catalogue courant ; validation : serveur).
 */

export interface CartItem {
  key: string; // produit + variante + options : deux ajouts identiques fusionnent
  productId: string;
  variantId: string | null;
  optionIds: string[];
  quantity: number;
}

const EMPTY: CartItem[] = [];
const cache = new Map<string, CartItem[]>();
const listeners = new Set<() => void>();
const storageKey = (slug: string) => `ys_cart_${slug}`;

function read(slug: string): CartItem[] {
  if (cache.has(slug)) return cache.get(slug)!;
  let items: CartItem[] = EMPTY;
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (raw) items = (JSON.parse(raw) as CartItem[]).filter((i) => i && typeof i.productId === "string" && i.quantity > 0);
  } catch {
    items = EMPTY;
  }
  cache.set(slug, items);
  return items;
}

function write(slug: string, items: CartItem[]) {
  cache.set(slug, items);
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(items));
  } catch { /* stockage plein ou interdit : panier en mémoire seulement */ }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith("ys_cart_")) {
      cache.delete(e.key.slice("ys_cart_".length));
      listeners.forEach((l) => l());
    }
  });
}

export const itemKey = (productId: string, variantId: string | null, optionIds: string[]) =>
  [productId, variantId ?? "", [...optionIds].sort().join("+")].join("|");

export function useCart(slug: string) {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(slug),
    () => EMPTY,
  );

  const add = useCallback((productId: string, variantId: string | null, optionIds: string[], quantity: number) => {
    const key = itemKey(productId, variantId, optionIds);
    const cur = read(slug);
    const existing = cur.find((i) => i.key === key);
    write(slug, existing
      ? cur.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + quantity) } : i))
      : [...cur, { key, productId, variantId, optionIds, quantity }]);
  }, [slug]);

  const setQuantity = useCallback((key: string, quantity: number) => {
    const cur = read(slug);
    write(slug, quantity <= 0 ? cur.filter((i) => i.key !== key) : cur.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, quantity) } : i)));
  }, [slug]);

  const replace = useCallback((next: CartItem[]) => write(slug, next), [slug]);
  const clear = useCallback(() => write(slug, []), [slug]);

  return { items, add, setQuantity, replace, clear };
}
