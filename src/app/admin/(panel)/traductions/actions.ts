"use server";

import { revalidatePath } from "next/cache";
import { clearDictionaryCache } from "@/i18n/server";
import { authorize, logAction } from "@/lib/admin";
import { readConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { sourceHash, translateMany } from "@/lib/translate";
import { translationSources, type Group } from "./sources";

type Result = { ok?: string; error?: string } | undefined;
const GROUPS: Group[] = ["menu", "site", "ui"];
const LOCALE = /^[a-z]{2}$/;

/** Traduit d'avance tout ce qui manque (ou dont l'original a changé) dans une langue. */
export async function pretranslateAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("tech.config");
  const locale = String(form.get("locale") ?? "");
  if (!LOCALE.test(locale)) return { error: "Langue invalide." };
  const config = await readConfig();
  if (config.translation.provider === "none") return { error: "Aucun service de traduction : choisissez-en un dans Configuration → Traduction automatique." };
  let total = 0;
  let done = 0;
  for (const g of GROUPS) {
    if (g === "ui" && (locale === "fr" || locale === "en")) continue; // dictionnaires intégrés
    const { items, sourceLocale } = await translationSources(g);
    total += items.filter((i) => i.text.trim()).length;
    done += (await translateMany(items, locale, { sourceLocale })).size;
  }
  clearDictionaryCache(locale);
  await logAction(staff, "translations.pretranslate", "Translation", locale, null, { locale, done, total });
  revalidatePath("/", "layout");
  return done < total
    ? { error: `${done} texte(s) sur ${total} traduits. Le service n'a pas répondu pour les autres : vérifiez la clé API puis relancez.` }
    : { ok: `${done} texte(s) traduits en « ${locale} ».` };
}

/**
 * Corrections manuelles : un texte modifié devient « manuel » (jamais écrasé par la
 * traduction automatique) ; un champ vidé revient à la traduction automatique.
 */
export async function saveTranslationsAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("tech.config");
  const locale = String(form.get("locale") ?? "");
  const group = String(form.get("group") ?? "") as Group;
  if (!LOCALE.test(locale) || !GROUPS.includes(group)) return { error: "Requête invalide." };
  const { items } = await translationSources(group);
  const byKey = new Map(items.map((i) => [`${i.entityType}|${i.entityId}|${i.field}`, i]));
  let changed = 0;
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("tr:")) continue;
    const key = name.slice(3);
    const item = byKey.get(key);
    const before = String(form.get(`was:${key}`) ?? "");
    const text = String(value).trim().slice(0, 4000);
    if (!item || text === before.trim()) continue;
    const where = { entityType_entityId_field_locale: { entityType: item.entityType, entityId: item.entityId, field: item.field, locale } };
    if (!text) await db.translation.delete({ where }).catch(() => {});
    else {
      await db.translation.upsert({
        where,
        create: { entityType: item.entityType, entityId: item.entityId, field: item.field, locale, text, source: "MANUAL", sourceHash: sourceHash(item.text) },
        update: { text, source: "MANUAL", sourceHash: sourceHash(item.text) },
      });
    }
    changed++;
  }
  if (group === "ui") clearDictionaryCache(locale);
  if (changed) await logAction(staff, "translations.edit", "Translation", locale, null, { locale, group, changed });
  revalidatePath("/", "layout");
  return { ok: changed ? `${changed} traduction(s) enregistrée(s).` : "Aucune modification." };
}
