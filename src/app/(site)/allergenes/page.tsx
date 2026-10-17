import type { Metadata } from "next";
import { PageHero } from "@/components/site/Sections";
import { translateMenu } from "@/i18n/content";
import type { MessageKey } from "@/i18n/fr";
import { getI18n } from "@/i18n/server";
import { ALLERGENS, allergenCodes, allergensDeclared } from "@/lib/catalog-constants";
import { loadMenu } from "@/lib/menu";
import { listRestaurants } from "@/lib/restaurants";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("allergens.title"), description: t("allergens.intro").slice(0, 160), alternates: { canonical: "/allergenes" } };
}
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

/** Tableau produits × 14 allergènes réglementaires (règlement UE 1169/2011). */
export default async function Allergens() {
  const [[first], { t, locale, defaultLocale }] = await Promise.all([listRestaurants(), getI18n()]);
  const original = first ? await loadMenu(first.id) : { categories: [], products: [] };
  const { menu } = locale === defaultLocale ? { menu: original } : await translateMenu(original, locale);
  const byId = new Map(menu.products.map((p) => [p.id, p]));
  const missing = menu.products.filter((p) => !allergensDeclared(p.allergens)).length;
  const label = (code: string) => t(`allergen.${code}` as MessageKey);
  return (
    <>
      <PageHero crumbs={[{ href: "/", label: t("breadcrumb.home") }, { href: "/allergenes", label: t("allergens.title") }]} title={t("allergens.title")} text={t("allergens.intro")} />
      <div className="wrap py-12">
        {missing > 0 && <p className="mb-8 rounded-2xl bg-amber-50 p-4 text-sm">{t("allergens.missing", { n: missing })}</p>}
        <ul className="mb-10 flex flex-wrap gap-2 text-sm" aria-label={t("allergens.legend")}>
          {ALLERGENS.map((a, i) => <li key={a.code} className="rounded-full bg-white px-3 py-1 ring-1 ring-line"><strong>{i + 1}</strong> {label(a.code)}</li>)}
        </ul>
        {menu.categories.map((c) => (
          <section key={c.id} className="mb-12">
            <h2 className="text-3xl">{c.name}</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
              <table className="w-full min-w-[720px] text-start text-sm">
                <thead>
                  <tr className="border-b border-line bg-linen/50">
                    <th scope="col" className="px-4 py-3 text-start">{t("allergens.product")}</th>
                    {ALLERGENS.map((a, i) => <th key={a.code} scope="col" title={label(a.code)} className="w-9 px-1 py-3 text-center font-semibold"><abbr title={label(a.code)} className="no-underline">{i + 1}</abbr></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.productIds.map((id) => byId.get(id)).filter((p) => !!p).map((p) => {
                    const codes = allergenCodes(p.allergens);
                    const known = allergensDeclared(p.allergens);
                    return (
                      <tr key={p.id}>
                        <th scope="row" className="px-4 py-2.5 text-start font-medium">
                          {p.name}
                          {known && codes.length === 0 && <span className="ms-2 text-xs font-normal text-green-700">{t("product.allergensNone")}</span>}
                        </th>
                        {ALLERGENS.map((a) => (
                          <td key={a.code} className="px-1 text-center">
                            {codes.includes(a.code) ? <span className="text-brand-700" aria-label={label(a.code)}>●</span> : known ? "" : <span className="text-muted">?</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="text-sm text-muted">{t("allergens.disclaimer")}</p>
      </div>
    </>
  );
}
