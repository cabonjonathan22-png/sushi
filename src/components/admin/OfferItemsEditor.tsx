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
