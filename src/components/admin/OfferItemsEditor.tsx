"use client";

import { useState } from "react";

type Product = { id: string; name: string; priceCents: number; variants: { id: string; label: string; priceCents: number }[] };
type Item = { productId: string; variantId: string | null; priceCents: number };

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
const toEuros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const parse = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
  return s.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * Produits d'une offre : on ajoute / retire des produits, leur prix actuel s'affiche tout seul,
 * il ne reste qu'à saisir le prix pendant l'offre. Envoyé au serveur dans le champ caché « items » (JSON).
 */
export function OfferItemsEditor({ products, initial }: { products: Product[]; initial: Item[] }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const [rows, setRows] = useState(() => initial.map((i) => ({ ...i, price: toEuros(i.priceCents) })));
  const [pick, setPick] = useState("");
  const [search, setSearch] = useState("");

  const regular = (r: { productId: string; variantId: string | null }) => {
    const p = byId.get(r.productId);
    return (r.variantId ? p?.variants.find((v) => v.id === r.variantId)?.priceCents : p?.priceCents) ?? 0;
  };
  const add = () => {
    if (!pick) return;
    const [productId, variantId = null] = pick.split("|") as [string, string?];
    if (rows.some((r) => r.productId === productId && r.variantId === (variantId || null))) return;
    const price = regular({ productId, variantId: variantId || null });
    setRows((rs) => [...rs, { productId, variantId: variantId || null, priceCents: price, price: toEuros(price) }]);
    setPick("");
  };
  const options = products
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .flatMap((p) => (p.variants.length
      ? p.variants.map((v) => ({ value: `${p.id}|${v.id}`, label: `${p.name} — ${v.label} (${eur(v.priceCents)})` }))
      : [{ value: p.id, label: `${p.name} (${eur(p.priceCents)})` }]));
  const regularTotal = rows.reduce((a, r) => a + regular(r), 0);
  const offerTotal = rows.reduce((a, r) => a + (parse(r.price) ?? 0), 0);
  const [total, setTotal] = useState("");
  /** Prix final global : réparti sur les produits au prorata de leur prix actuel (la somme tombe juste au centime). */
  const applyTotal = (value: string) => {
    setTotal(value);
    const t = parse(value);
    if (t === null || !rows.length || regularTotal <= 0) return;
    const shares = rows.map((x) => (regular(x) * t) / regularTotal);
    const floors = shares.map(Math.floor);
    let rest = t - floors.reduce((a, b) => a + b, 0);
    const order = shares.map((v, i) => [v - floors[i]!, i] as const).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) { if (rest <= 0) break; floors[i]! += 1; rest -= 1; }
    setRows((rs) => rs.map((x, i) => ({ ...x, price: toEuros(floors[i]!) })));
  };
  const items = rows.flatMap((r) => {
    const c = parse(r.price);
    return c === null ? [] : [{ productId: r.productId, variantId: r.variantId, priceCents: c }];
  });

  return (
    <div className="sm:col-span-2">
      <p className="label">Produits de l&apos;offre (aucun = simple annonce)</p>
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {rows.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead><tr className="text-left text-neutral-600"><th className="py-1">Produit</th><th className="py-1">Prix actuel</th><th className="py-1">Prix pendant l&apos;offre</th><th /></tr></thead>
          <tbody className="divide-y">
            {rows.map((r, i) => {
              const p = byId.get(r.productId);
              const v = r.variantId ? p?.variants.find((x) => x.id === r.variantId) : undefined;
              const c = parse(r.price);
              return (
                <tr key={`${r.productId}|${r.variantId ?? ""}`}>
                  <td className="py-2 pr-2 font-semibold">{p?.name ?? "Produit supprimé"}{v ? ` — ${v.label}` : ""}</td>
                  <td className="py-2 pr-2">{eur(regular(r))}</td>
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-1">
                      <input value={r.price} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                        inputMode="decimal" className={`input w-28 ${c === null ? "ring-2 ring-red-500" : ""}`} aria-label="Prix pendant l'offre" /> €
                      {c !== null && c < regular(r) && <span className="text-xs text-green-700">−{eur(regular(r) - c)}</span>}
                    </span>
                  </td>
                  <td className="py-2 text-right"><button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-red-700 underline">Retirer</button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td className="py-2 pr-2">Total</td>
              <td className="py-2 pr-2">{eur(regularTotal)}</td>
              <td className="py-2 pr-2" colSpan={2}>
                <span className="flex flex-wrap items-center gap-2">
                  <input value={total || toEuros(offerTotal)} onChange={(e) => applyTotal(e.target.value)} onBlur={() => setTotal("")}
                    inputMode="decimal" className="input w-28 font-bold" aria-label="Prix final global de l'offre" /> €
                  {offerTotal < regularTotal && <span className="text-xs text-green-700">−{eur(regularTotal - offerTotal)}</span>}
                </span>
                <span className="block text-xs font-normal text-neutral-500">Prix final global : tapez-le ici, il est réparti automatiquement sur les produits (chaque ligne reste modifiable).</span>
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un produit" className="input w-48" />
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="input min-w-0 flex-1">
          <option value="">— Choisir un produit à ajouter —</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={add} disabled={!pick} className="btn-ghost">+ Ajouter</button>
      </div>
    </div>
  );
}
