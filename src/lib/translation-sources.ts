import "server-only";
import { en } from "@/i18n/en";
import { menuTranslationItems } from "@/i18n/content";
import { readConfig } from "./config";
import { db } from "./db";
import { loadMenu } from "./menu";
import { getSiteSettings } from "./restaurants";
import { translateMany, type TranslateItem } from "./translate";

export type Group = "menu" | "site" | "ui";

/** Textes d'origine à traduire, par onglet (carte, textes du site, interface). */
export async function translationSources(group: Group): Promise<{ items: (TranslateItem & { context: string })[]; sourceLocale: string }> {
  const config = await readConfig();
  if (group === "ui") {
    // L'interface est traduite depuis l'anglais (dictionnaire intégré).
    return { sourceLocale: "en", items: (Object.keys(en) as (keyof typeof en)[]).map((k) => ({ entityType: "ui", entityId: "public", field: k, text: en[k], context: k })) };
  }
  if (group === "site") {
    const [settings, restaurants] = await Promise.all([getSiteSettings(), db.restaurant.findMany({ where: { description: { not: "" } }, select: { id: true, name: true, description: true } })]);
    const c = settings.content;
    const home = { heroTitle: c.heroTitle ?? "", heroTagline: c.heroTagline ?? "", intro: c.intro ?? "", commitment: c.commitment ?? "", cuisine: config.site.cuisine };
    const labels: Record<string, string> = { heroTitle: "Accueil — surtitre", heroTagline: "Accueil — accroche", intro: "Accueil — bienvenue", commitment: "Accueil — engagement", cuisine: "Type de cuisine" };
    return {
      sourceLocale: config.region.defaultLocale,
      items: [
        ...Object.entries(home).filter(([, v]) => v).map(([field, text]) => ({ entityType: "site", entityId: "home", field, text, context: labels[field] ?? field })),
        ...restaurants.map((r) => ({ entityType: "restaurant", entityId: r.id, field: "description", text: r.description, context: `${r.name} — description` })),
      ],
    };
  }
  const first = await db.restaurant.findFirst({ orderBy: { sortOrder: "asc" }, select: { id: true } });
  const menu = first ? await loadMenu(first.id, { includeHidden: true }) : { categories: [], products: [] };
  const names = new Map<string, string>([
    ...menu.categories.map((c) => [c.id, `Catégorie ${c.name}`] as const),
    ...menu.products.map((p) => [p.id, p.name] as const),
    ...menu.products.flatMap((p) => [...p.variants.map((v) => [v.id, `${p.name} › variante`] as const), ...p.optionGroups.flatMap((g) => [[g.id, `${p.name} › options`] as const, ...g.options.map((o) => [o.id, `${p.name} › ${g.name}`] as const)])]),
  ]);
  const FIELD: Record<string, string> = { name: "nom", shortDescription: "description courte", description: "description", label: "libellé" };
  return {
    sourceLocale: config.region.defaultLocale,
    items: menuTranslationItems(menu).map((i) => ({ ...i, context: `${names.get(i.entityId) ?? ""} — ${FIELD[i.field] ?? i.field}` })),
  };
}

/**
 * Traduit d'avance tout ce qui manque (carte, textes du site, interface) dans chaque langue
 * proposée aux clients. Appelé par la tâche planifiée : avec le service gratuit, le quota
 * journalier est consommé petit à petit, chaque texte n'étant traduit qu'une seule fois.
 */
export async function pretranslateAll(): Promise<void> {
  const config = await readConfig();
  if (config.translation.provider === "none") return;
  const targets = config.region.languages.filter((l) => l !== config.region.defaultLocale);
  for (const locale of targets) {
    for (const group of ["menu", "site", "ui"] as Group[]) {
      if (group === "ui" && (locale === "fr" || locale === "en")) continue;
      const { items, sourceLocale } = await translationSources(group);
      await translateMany(items, locale, { sourceLocale, wait: true });
    }
  }
}
