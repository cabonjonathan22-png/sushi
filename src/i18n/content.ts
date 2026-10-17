import "server-only";
import type { Menu } from "@/lib/menu";
import { translateMany, translationKey, type TranslateItem } from "@/lib/translate";

/**
 * Traduction du contenu saisi par le restaurant (menu, textes) dans la langue du client.
 * Les commandes gardent les noms d'origine (cuisine et ticket dans la langue du restaurant).
 */
/** Textes traduisibles d'une carte (catégories, plats, variantes, options). */
export function menuTranslationItems(menu: Menu): TranslateItem[] {
  const items: TranslateItem[] = [];
  for (const c of menu.categories) {
    items.push({ entityType: "category", entityId: c.id, field: "name", text: c.name });
    if (c.description) items.push({ entityType: "category", entityId: c.id, field: "description", text: c.description });
  }
  for (const p of menu.products) {
    items.push({ entityType: "product", entityId: p.id, field: "name", text: p.name });
    if (p.shortDescription) items.push({ entityType: "product", entityId: p.id, field: "shortDescription", text: p.shortDescription });
    if (p.description) items.push({ entityType: "product", entityId: p.id, field: "description", text: p.description });
    for (const v of p.variants) items.push({ entityType: "variant", entityId: v.id, field: "label", text: v.label });
    for (const g of p.optionGroups) {
      items.push({ entityType: "optionGroup", entityId: g.id, field: "name", text: g.name });
      for (const o of g.options) items.push({ entityType: "option", entityId: o.id, field: "name", text: o.name });
    }
  }
  return items;
}

export async function translateMenu(menu: Menu, locale: string): Promise<{ menu: Menu; translated: boolean }> {
  const tr = await translateMany(menuTranslationItems(menu), locale);
  if (!tr.size) return { menu, translated: false };
  const get = (entityType: string, entityId: string, field: string, fallback: string) => tr.get(translationKey({ entityType, entityId, field })) ?? fallback;
  return {
    translated: true,
    menu: {
      categories: menu.categories.map((c) => ({ ...c, name: get("category", c.id, "name", c.name), description: get("category", c.id, "description", c.description) })),
      products: menu.products.map((p) => ({
        ...p,
        name: get("product", p.id, "name", p.name),
        shortDescription: get("product", p.id, "shortDescription", p.shortDescription),
        description: get("product", p.id, "description", p.description),
        variants: p.variants.map((v) => ({ ...v, label: get("variant", v.id, "label", v.label) })),
        optionGroups: p.optionGroups.map((g) => ({
          ...g,
          name: get("optionGroup", g.id, "name", g.name),
          options: g.options.map((o) => ({ ...o, name: get("option", o.id, "name", o.name) })),
        })),
      })),
    },
  };
}

/** Traduit des textes libres (accueil, restaurant…) identifiés par une clé. */
export async function translateTexts<K extends string>(entityType: string, entityId: string, texts: Record<K, string>, locale: string): Promise<Record<K, string>> {
  const entries = Object.entries(texts) as [K, string][];
  const tr = await translateMany(entries.map(([field, text]) => ({ entityType, entityId, field, text })), locale);
  return Object.fromEntries(entries.map(([field, text]) => [field, tr.get(translationKey({ entityType, entityId, field })) ?? text])) as Record<K, string>;
}
