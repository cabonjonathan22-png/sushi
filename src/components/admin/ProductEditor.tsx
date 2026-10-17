"use client";

import { useActionState, useState } from "react";
import { saveProductAction } from "@/app/admin/(panel)/menu/actions";
import { ALLERGENS, NO_ALLERGEN } from "@/lib/catalog-constants";
import { badgeTextColor, type BadgeDef } from "@/lib/config-schema";
import { SubmitButton } from "./forms";

type Variant = { id?: string; label: string; price: string; active: boolean };
type Option = { id?: string; name: string; price: string; active: boolean };
type Group = { id?: string; name: string; minSelect: number; maxSelect: number; options: Option[] };

export interface ProductFormData {
  id?: string;
  name: string;
  shortDescription: string;
  description: string;
  price: string;
  vatRate: number;
  categoryIds: string[];
  allergens: string[];
  badges: string[];
  isAlcohol: boolean;
  maxQuantity: string;
  includedExtras: string;
  availablePickup: boolean;
  availableDelivery: boolean;
  availableDineIn: boolean;
  availableLunch: boolean;
  availableDinner: boolean;
  active: boolean;
  image: string | null;
  variants: Variant[];
  groups: Group[];
}


export function ProductEditor({ initial, categories, badges, vatRates, restaurants }: {
  initial: ProductFormData;
  categories: { id: string; name: string }[];
  badges: BadgeDef[];
  vatRates: { value: number; label: string }[];
  /** Restaurants où le produit est proposé (cases à cocher) ; vide = gestion indisponible pour ce compte. */
  restaurants: { id: string; name: string; enabled: boolean }[];
}) {
  const [state, action] = useActionState(saveProductAction, undefined);
  const [variants, setVariants] = useState<Variant[]>(initial.variants);
  const [groups, setGroups] = useState<Group[]>(initial.groups);
  const [preview, setPreview] = useState<string | null>(initial.image);

  const setVariant = (i: number, patch: Partial<Variant>) => setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setGroup = (i: number, patch: Partial<Group>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setOption = (gi: number, oi: number, patch: Partial<Option>) =>
    setGroups((g) => g.map((x, j) => (j === gi ? { ...x, options: x.options.map((o, k) => (k === oi ? { ...o, ...patch } : o)) } : x)));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="structure" value={JSON.stringify({ variants, groups })} />

      <div className="space-y-6">
        <section className="card grid gap-4 p-5">
          <div>
            <label className="label" htmlFor="name">Nom du produit</label>
            <input id="name" name="name" required maxLength={100} defaultValue={initial.name} className="input text-lg" />
          </div>
          <div>
            <label className="label" htmlFor="sd">Description courte (affichée sur le menu)</label>
            <textarea id="sd" name="shortDescription" maxLength={400} defaultValue={initial.shortDescription} className="input min-h-20" />
          </div>
          <div>
            <label className="label" htmlFor="ld">Description détaillée (facultative)</label>
            <textarea id="ld" name="description" maxLength={2000} defaultValue={initial.description} className="input min-h-20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="price">Prix TTC (€)</label>
              <input id="price" name="price" required inputMode="decimal" defaultValue={initial.price} className="input text-lg" />
              {variants.length > 0 && <p className="mt-1 text-xs text-neutral-600">Avec variantes, c'est le prix de chaque variante qui compte.</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="vat">Taux de TVA</label>
              <select id="vat" name="vatRate" defaultValue={initial.vatRate} className="input">
                {vatRates.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-3xl">Variantes <span className="text-base font-normal text-neutral-600">(ex. 3 ou 6 pièces, frit ou vapeur — le client doit en choisir une)</span></h2>
          <div className="mt-3 space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
                <input aria-label="Nom de la variante" value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} className="input" placeholder="6 pièces · Frit" />
                <input aria-label="Prix" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} inputMode="decimal" className="input" placeholder="8,50" />
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setVariant(i, { active: e.target.checked })} className="h-5 w-5" />Active</label>
                <button type="button" onClick={() => setVariants((x) => x.filter((_, j) => j !== i))} className="rounded-lg px-3 py-2 text-red-700 hover:bg-red-50" aria-label="Supprimer la variante">✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setVariants((x) => [...x, { label: "", price: "", active: true }])} className="btn-ghost mt-3">+ Ajouter une variante</button>
        </section>

        <section className="card p-5">
          <h2 className="text-3xl">Options <span className="text-base font-normal text-neutral-600">(suppléments payants ou gratuits)</span></h2>
          <div className="mt-3 space-y-4">
            {groups.map((g, gi) => (
              <div key={gi} className="rounded-xl border border-neutral-200 p-3">
                <div className="grid grid-cols-[1fr_80px_80px_auto] items-end gap-2">
                  <div><label className="label">Groupe</label><input value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} className="input" placeholder="Sauce en plus" /></div>
                  <div><label className="label">Min</label><input type="number" min={0} max={20} value={g.minSelect} onChange={(e) => setGroup(gi, { minSelect: Number(e.target.value) })} className="input" /></div>
                  <div><label className="label">Max</label><input type="number" min={1} max={20} value={g.maxSelect} onChange={(e) => setGroup(gi, { maxSelect: Number(e.target.value) })} className="input" /></div>
                  <button type="button" onClick={() => setGroups((x) => x.filter((_, j) => j !== gi))} className="rounded-lg px-3 py-2 text-red-700 hover:bg-red-50" aria-label="Supprimer le groupe">✕</button>
                </div>
                <div className="mt-2 space-y-2 pl-3">
                  {g.options.map((o, oi) => (
                    <div key={oi} className="grid grid-cols-[1fr_100px_auto_auto] items-center gap-2">
                      <input aria-label="Option" value={o.name} onChange={(e) => setOption(gi, oi, { name: e.target.value })} className="input" placeholder="Sauce soja" />
                      <input aria-label="Supplément" value={o.price} onChange={(e) => setOption(gi, oi, { price: e.target.value })} inputMode="decimal" className="input" placeholder="0,00" />
                      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={o.active} onChange={(e) => setOption(gi, oi, { active: e.target.checked })} className="h-5 w-5" />Active</label>
                      <button type="button" onClick={() => setGroup(gi, { options: g.options.filter((_, k) => k !== oi) })} className="rounded-lg px-3 py-2 text-red-700 hover:bg-red-50" aria-label="Supprimer l'option">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setGroup(gi, { options: [...g.options, { name: "", price: "0", active: true }] })} className="text-sm font-semibold underline">+ option</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setGroups((x) => [...x, { name: "", minSelect: 0, maxSelect: 1, options: [{ name: "", price: "0", active: true }] }])} className="btn-ghost mt-3">+ Groupe d'options</button>
        </section>

        <section className="card p-5">
          <h2 className="text-3xl">Allergènes</h2>
          <p className="text-sm text-neutral-600">Les 14 allergènes à déclaration obligatoire. Affichés sur la fiche produit et la page « Allergènes ». Rien de coché = « information non renseignée » : cochez « Aucun allergène » pour un produit qui n'en contient aucun.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALLERGENS.map((a) => (
              <label key={a.code} className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3">
                <input type="checkbox" name="allergens" value={a.code} defaultChecked={initial.allergens.includes(a.code)} className="h-5 w-5 accent-brand-600" />{a.label}
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3 font-semibold">
              <input type="checkbox" name="allergens" value={NO_ALLERGEN} defaultChecked={initial.allergens.includes(NO_ALLERGEN)} className="h-5 w-5 accent-brand-600" />Aucun allergène
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <h2 className="text-3xl">Photo</h2>
          {preview ? <img src={preview} alt="" className="mt-2 aspect-square w-full rounded-xl object-cover" /> : <div className="mt-2 flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">Pas de photo</div>}
          <input type="file" name="image" accept="image/*" className="mt-3 block w-full text-sm" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPreview(URL.createObjectURL(f));
          }} />
          <p className="mt-1 text-xs text-neutral-600">JPEG, PNG, WebP ou photo de téléphone, 8 Mo max. Recadrée en carré automatiquement.</p>
          {initial.image && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" className="h-4 w-4" />Retirer la photo</label>}
        </section>

        <section className="card p-5">
          <h2 className="text-3xl">Catégories</h2>
          <div className="mt-2 grid gap-1">
            {categories.map((c) => (
              <label key={c.id} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={initial.categoryIds.includes(c.id)} className="h-5 w-5 accent-brand-600" />{c.name}
              </label>
            ))}
          </div>
        </section>

        {restaurants.length > 0 && (
          <section className="card p-5">
            <h2 className="text-3xl">Restaurants</h2>
            <p className="text-sm text-neutral-600">Proposé dans :</p>
            <input type="hidden" name="restaurantScope" value={restaurants.map((r) => r.id).join(",")} />
            <div className="mt-2 grid gap-1">
              {restaurants.map((r) => (
                <label key={r.id} className="flex min-h-10 items-center gap-2">
                  <input type="checkbox" name="restaurantIds" value={r.id} defaultChecked={r.enabled} className="h-5 w-5 accent-brand-600" />{r.name}
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="card p-5">
          <h2 className="text-3xl">Badges</h2>
          <div className="mt-2 grid gap-1">
            {badges.map((b) => (
              <label key={b.code} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" name="badges" value={b.code} defaultChecked={initial.badges.includes(b.code)} className="h-5 w-5 accent-brand-600" />
                <span className="chip" style={{ backgroundColor: b.color, color: badgeTextColor(b.color) }}>{b.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card grid gap-2 p-5">
          <h2 className="text-3xl">Disponibilité</h2>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="active" defaultChecked={initial.active} className="h-5 w-5" />Visible sur le menu</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="availablePickup" defaultChecked={initial.availablePickup} className="h-5 w-5" />À emporter</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="availableDelivery" defaultChecked={initial.availableDelivery} className="h-5 w-5" />En livraison</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="availableDineIn" defaultChecked={initial.availableDineIn} className="h-5 w-5" />Sur place</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="availableLunch" defaultChecked={initial.availableLunch} className="h-5 w-5" />Le midi</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="availableDinner" defaultChecked={initial.availableDinner} className="h-5 w-5" />Le soir</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="isAlcohol" defaultChecked={initial.isAlcohol} className="h-5 w-5" />Contient de l'alcool (mention légale + 18 ans)</label>
          <div>
            <label className="label" htmlFor="incx">« Petits plus » offerts avec ce produit</label>
            <input id="incx" name="includedExtras" type="number" min={0} max={50} defaultValue={initial.includedExtras} className="input" />
            <p className="mt-1 text-xs text-neutral-600">Ex. 2 : deux sauces (ou wasabi, gingembre…) offertes par exemplaire commandé.</p>
          </div>
          <div>
            <label className="label" htmlFor="maxq">Quantité max par commande</label>
            <input id="maxq" name="maxQuantity" type="number" min={1} defaultValue={initial.maxQuantity} placeholder="Illimitée" className="input" />
          </div>
        </section>

        <div className="sticky bottom-4 space-y-2">
          {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{state.error}</p>}
          {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">{state.ok}</p>}
          <SubmitButton className="btn-primary w-full text-lg shadow-lg">Enregistrer</SubmitButton>
        </div>
      </aside>
    </form>
  );
}
