"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  reorderCategoriesAction, reorderProductsAction, toggleCategoryRestaurantAction, toggleRestaurantActiveAction, toggleStockAction, toggleVariantStockAction,
} from "@/app/admin/(panel)/menu/actions";
import { euros } from "@/lib/money";

export interface AdminMenuProduct {
  id: string;
  name: string;
  priceCents: number;
  image: string | null;
  active: boolean; // actif au catalogue
  restaurantActive: boolean;
  outOfStock: boolean;
  variants: { id: string; label: string; outOfStock: boolean }[];
}

export interface AdminMenuCategory {
  id: string;
  name: string;
  visible: boolean;
  /** Affichée dans le restaurant sélectionné. */
  restaurantVisible: boolean;
  kind: "STANDARD" | "EXTRAS";
  products: AdminMenuProduct[];
}

function Handle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className="cursor-grab touch-none rounded-lg px-2 py-3 text-xl text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing" aria-label="Déplacer (glisser, ou Espace puis flèches)">⠿</button>;
}

function Sortable({ id, children }: { id: string; children: (handle: React.HTMLAttributes<HTMLButtonElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: "relative" }}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** Interrupteur qui envoie une action serveur (formulaire) en 1 clic. */
function Switch({ action, fields, on, labelOn, labelOff, danger }: {
  action: (f: FormData) => Promise<void>;
  fields: Record<string, string>;
  on: boolean;
  labelOn: string;
  labelOff: string;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState(on);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={state}
      disabled={pending}
      onClick={() => {
        const next = !state;
        setState(next);
        const f = new FormData();
        Object.entries(fields).forEach(([k, v]) => f.set(k, v));
        f.set("value", danger ? (next ? "0" : "1") : next ? "1" : "0");
        start(() => action(f));
      }}
      className={`min-h-11 min-w-28 rounded-xl px-3 text-sm font-bold transition ${state ? "bg-green-600 text-white" : danger ? "bg-red-600 text-white" : "bg-neutral-300 text-neutral-800"} disabled:opacity-60`}
    >
      {state ? labelOn : labelOff}
    </button>
  );
}

export function MenuManager({ restaurantId, initial, canEdit, canRestaurant }: {
  restaurantId: string;
  initial: AdminMenuCategory[];
  canEdit: boolean;
  canRestaurant: boolean;
}) {
  const [cats, setCats] = useState(initial);
  const [query, setQuery] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const q = query.trim().toLowerCase();

  const onCategoryDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(cats, cats.findIndex((c) => c.id === e.active.id), cats.findIndex((c) => c.id === e.over!.id));
    setCats(next);
    start(() => reorderCategoriesAction(next.map((c) => c.id)));
  };
  const onProductDrag = (catId: string) => (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setCats((cur) => cur.map((c) => {
      if (c.id !== catId) return c;
      const products = arrayMove(c.products, c.products.findIndex((p) => p.id === e.active.id), c.products.findIndex((p) => p.id === e.over!.id));
      start(() => reorderProductsAction(catId, products.map((p) => p.id)));
      return { ...c, products };
    }));
  };

  const productRow = (p: AdminMenuProduct, handle?: React.HTMLAttributes<HTMLButtonElement>) => (
    <div className={`flex flex-wrap items-center gap-3 border-t border-neutral-100 bg-white px-3 py-2 ${!p.active || !p.restaurantActive ? "opacity-60" : ""}`}>
      {handle && <Handle {...handle} />}
      {p.image ? <img src={p.image} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded-lg bg-neutral-100" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">{p.name}{!p.active && <span className="chip ml-2 bg-neutral-200">masqué partout</span>}</p>
        <p className="text-sm text-neutral-600">{euros(p.priceCents)}{p.variants.length > 0 && ` · ${p.variants.length} variantes`}</p>
      </div>
      <Switch action={toggleStockAction} fields={{ restaurantId, productId: p.id }} on={!p.outOfStock} labelOn="Disponible" labelOff="RUPTURE" danger />
      {canRestaurant && <Switch action={toggleRestaurantActiveAction} fields={{ restaurantId, productId: p.id }} on={p.restaurantActive} labelOn="Au menu" labelOff="Retiré" />}
      {canEdit && <Link href={`/admin/menu/produits/${p.id}`} className="btn-ghost min-h-11 px-3 text-sm">Modifier</Link>}
      {p.variants.length > 0 && (
        <details className="w-full pl-14">
          <summary className="cursor-pointer text-sm text-neutral-600">Ruptures par variante</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.variants.map((v) => (
              <span key={v.id} className="flex items-center gap-2 rounded-xl bg-neutral-50 py-1 pl-3 pr-1 text-sm">
                {v.label}
                <Switch action={toggleVariantStockAction} fields={{ restaurantId, variantId: v.id }} on={!v.outOfStock} labelOn="Dispo" labelOff="Rupture" danger />
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );

  if (q) {
    const found = cats.flatMap((c) => c.products).filter((p, i, a) => p.name.toLowerCase().includes(q) && a.findIndex((x) => x.id === p.id) === i);
    return (
      <div className="space-y-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…" className="input" aria-label="Rechercher" />
        <div className="card overflow-hidden">{found.map((p) => <div key={p.id}>{productRow(p)}</div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…" className="input" aria-label="Rechercher" />
      {/* Identifiants fixes : évitent un écart entre le rendu serveur et le navigateur. */}
      <DndContext id="dnd-categories" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCategoryDrag}>
        <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cats.map((c) => (
            <Sortable key={c.id} id={c.id}>
              {(handle) => (
                <details className="card mb-3 overflow-hidden" open={cats.length < 4}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
                    {canEdit && <Handle {...handle} />}
                    <span className="font-display text-3xl">{c.name}</span>
                    <span className="text-neutral-500">({c.products.length})</span>
                    {c.kind === "EXTRAS" && <span className="chip bg-brand-100">proposé au panier</span>}
                    {!c.visible && <span className="chip bg-neutral-200">masquée partout</span>}
                    {canRestaurant && (
                      <span className="ml-2" onClick={(e) => e.stopPropagation()}>
                        <Switch action={toggleCategoryRestaurantAction} fields={{ restaurantId, categoryId: c.id }} on={c.restaurantVisible} labelOn="Affichée ici" labelOff="Masquée ici" />
                      </span>
                    )}
                    {canEdit && <Link href={`/admin/menu/categories/${c.id}`} className="ml-auto text-sm font-semibold underline" onClick={(e) => e.stopPropagation()}>Modifier</Link>}
                  </summary>
                  <DndContext id={`dnd-${c.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProductDrag(c.id)}>
                    <SortableContext items={c.products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                      {c.products.map((p) => (
                        <Sortable key={p.id} id={p.id}>{(h) => productRow(p, canEdit ? h : undefined)}</Sortable>
                      ))}
                    </SortableContext>
                  </DndContext>
                </details>
              )}
            </Sortable>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
