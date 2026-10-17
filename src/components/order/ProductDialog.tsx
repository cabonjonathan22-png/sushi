"use client";

import { allergenCodes, allergensDeclared } from "@/lib/catalog-constants";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { BadgeDef } from "@/lib/config-schema";
import { BadgeChip } from "../site/BadgeChip";
import { euros } from "@/lib/money";
import type { ClientProduct } from "./types";

/**
 * Fenêtre de choix d'un produit : variante (frit / vapeur…), options, quantité.
 * Basée sur <dialog> natif : focus piégé, fermeture Échap, accessible au clavier.
 */
export function ProductDialog({
  product,
  onClose,
  onAdd,
  badges,
}: {
  badges: BadgeDef[];
  product: ClientProduct | null;
  onClose: () => void;
  onAdd: (variantId: string | null, optionIds: string[], quantity: number) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (product) {
      const firstAvailable = product.variants.find((v) => v.active && !v.outOfStock);
      setVariantId(product.variants.length === 1 ? firstAvailable?.id ?? null : null);
      setOptions([]);
      setQty(1);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [product]);

  const unit = useMemo(() => {
    if (!product) return 0;
    const v = product.variants.find((x) => x.id === variantId);
    const base = v ? v.priceCents : product.variants.length ? product.fromPriceCents : product.priceCents;
    const extra = product.optionGroups.flatMap((g) => g.options).filter((o) => options.includes(o.id)).reduce((s, o) => s + o.priceDeltaCents, 0);
    return base + extra;
  }, [product, variantId, options]);

  if (!product) return <dialog ref={ref} />;

  const needsVariant = product.variants.length > 0 && !variantId;
  const groupsOk = product.optionGroups.every((g) => {
    const n = g.options.filter((o) => options.includes(o.id)).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const max = product.maxQuantity ?? 50;

  const toggleOption = (groupId: string, optionId: string) => {
    const g = product.optionGroups.find((x) => x.id === groupId)!;
    setOptions((cur) => {
      if (cur.includes(optionId)) return cur.filter((x) => x !== optionId);
      const inGroup = cur.filter((x) => g.options.some((o) => o.id === x));
      if (g.maxSelect === 1) return [...cur.filter((x) => !inGroup.includes(x)), optionId];
      return inGroup.length >= g.maxSelect ? cur : [...cur, optionId];
    });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="product-dialog-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-ink backdrop:bg-black/60 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="overflow-y-auto">
          {product.imageLarge ? (
            <img src={product.imageLarge.src} srcSet={product.imageLarge.srcSet} sizes="(min-width: 640px) 512px, 100vw" alt={product.name}
              className="aspect-[4/3] w-full bg-sand object-cover" />
          ) : <div className="h-6" />}
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="product-dialog-title" className="text-4xl leading-none">{product.name}</h2>
              <button type="button" onClick={() => ref.current?.close()} className="-me-2 -mt-1 rounded-full p-2 text-2xl leading-none hover:bg-neutral-100" aria-label={t("product.close")}>×</button>
            </div>
            {product.badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {product.badges.map((b) => <BadgeChip key={b} code={b} badges={badges} />)}
              </div>
            )}
            {product.shortDescription && <p className="mt-3 whitespace-pre-line text-neutral-700">{product.shortDescription}</p>}
            {product.description && <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">{product.description}</p>}
            {product.isAlcohol && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t("alcohol.notice")} {t("product.alcohol")}</p>}
            <p className="mt-3 text-sm text-neutral-600">
              <strong>{t("product.allergens")}</strong> {!allergensDeclared(product.allergens) ? t("product.allergensUnknown") : allergenCodes(product.allergens).length ? allergenCodes(product.allergens).map((a) => t(`allergen.${a}` as "allergen.FISH")).join(", ") : t("product.allergensNone")}
            </p>

            {product.variants.length > 0 && (
              <fieldset className="mt-5">
                <legend className="mb-2 font-semibold">{t("product.choice")} <span className="text-sm font-normal text-neutral-500">{t("product.required")}</span></legend>
                <div className="grid gap-2">
                  {product.variants.map((v) => (
                    <label key={v.id} className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border px-4 py-2 ${variantId === v.id ? "border-brand-600 bg-brand-50" : "border-neutral-300"} ${v.outOfStock ? "cursor-not-allowed opacity-50" : ""}`}>
                      <span className="flex items-center gap-3">
                        <input type="radio" name="variant" className="h-5 w-5 accent-brand-600" checked={variantId === v.id} disabled={v.outOfStock} onChange={() => setVariantId(v.id)} />
                        {v.label}{v.outOfStock && ` — ${t("product.variantOut")}`}
                      </span>
                      <span className="font-semibold">{euros(v.priceCents)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {product.optionGroups.map((g) => (
              <fieldset key={g.id} className="mt-5">
                <legend className="mb-2 font-semibold">
                  {g.name}{" "}
                  <span className="text-sm font-normal text-neutral-500">
                    {g.minSelect > 0
                      ? t("product.pick", { n: g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}` })
                      : g.maxSelect > 1 ? t("product.optionalMax", { n: g.maxSelect }) : t("product.optional")}
                  </span>
                </legend>
                <div className="grid gap-2">
                  {g.options.map((o) => (
                    <label key={o.id} className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border px-4 py-2 ${options.includes(o.id) ? "border-brand-600 bg-brand-50" : "border-neutral-300"}`}>
                      <span className="flex items-center gap-3">
                        <input type={g.maxSelect === 1 ? "radio" : "checkbox"} name={`g-${g.id}`} className="h-5 w-5 accent-brand-600"
                          checked={options.includes(o.id)} onChange={() => toggleOption(g.id, o.id)} />
                        {o.name}
                      </span>
                      <span className="text-sm text-neutral-600">{o.priceDeltaCents ? `+${euros(o.priceDeltaCents)}` : t("product.included")}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-200 p-4">
          <div className="flex items-center rounded-xl border border-neutral-300" role="group" aria-label={t("product.quantity")}>
            <button type="button" className="h-12 w-12 text-2xl disabled:opacity-30" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t("product.less")}>−</button>
            <span className="w-8 text-center text-lg font-semibold" aria-live="polite">{qty}</span>
            <button type="button" className="h-12 w-12 text-2xl disabled:opacity-30" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label={t("product.more")}>+</button>
          </div>
          <button
            type="button"
            className="btn-primary flex-1 justify-between text-lg"
            disabled={needsVariant || !groupsOk || product.outOfStock}
            onClick={() => {
              onAdd(variantId, options, qty);
              ref.current?.close();
            }}
          >
            <span>{needsVariant ? t("product.makeChoice") : t("product.add")}</span>
            <span>{euros(unit * qty)}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
