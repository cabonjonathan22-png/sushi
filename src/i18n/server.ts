import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getConfig, readConfig } from "@/lib/config";
import { setMoneyFormat } from "@/lib/money";
import { translateMany } from "@/lib/translate";
import { en } from "./en";
import { fr, type Dictionary, type MessageKey } from "./fr";
import { LANGUAGES, matchAcceptLanguage, RTL } from "./languages";

export const LANG_COOKIE = "ys_lang";
const BUILT_IN: Record<string, Dictionary> = { fr, en };

/** Langues que le client peut obtenir : celles proposées, + toutes si la traduction automatique est active. */
export async function availableLocales(): Promise<string[]> {
  const c = await getConfig();
  const auto = c.translation.provider !== "none";
  return [...new Set([c.region.defaultLocale, ...c.region.languages, ...(auto ? Object.keys(LANGUAGES) : ["fr", "en"])])];
}

/** Langue de la requête : choix du client (cookie) > langue de l'appareil > langue du restaurant. */
export const getLocale = cache(async (): Promise<string> => {
  // Cookies et en-têtes lus AVANT la base : la page est alors rendue à la demande
  // (jamais pré-rendue à la compilation, qui se fait sans base de données).
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  const acceptLanguage = (await headers()).get("accept-language");
  const c = await getConfig();
  const available = await availableLocales();
  if (chosen && available.includes(chosen)) return chosen;
  if (c.region.autoDetect) {
    const device = matchAcceptLanguage(acceptLanguage, available);
    if (device) return device;
  }
  return c.region.defaultLocale;
});

// Dictionnaires traduits automatiquement : gardés en mémoire 10 minutes (et en base durablement).
const memory = new Map<string, { at: number; dict: Dictionary }>();

/** Après une correction manuelle de l'interface traduite : relire la base. */
export function clearDictionaryCache(locale?: string) {
  if (locale) memory.delete(locale);
  else memory.clear();
}

export async function getDictionary(locale: string): Promise<Dictionary> {
  if (BUILT_IN[locale]) return BUILT_IN[locale]!;
  const hit = memory.get(locale);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.dict;
  const keys = Object.keys(en) as MessageKey[];
  const translated = await translateMany(
    keys.map((k) => ({ entityType: "ui", entityId: "public", field: k, text: en[k] })),
    locale,
    { sourceLocale: "en" },
  );
  const dict = Object.fromEntries(keys.map((k) => [k, translated.get(`ui|public|${k}`) ?? en[k]])) as Dictionary;
  // Traduction encore incomplète (en cours en arrière-plan) : mémorisée 30 s seulement.
  const complete = translated.size >= keys.length;
  memory.set(locale, { at: complete ? Date.now() : Date.now() - 10 * 60_000 + 30_000, dict });
  return dict;
}

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(dict: Dictionary): T {
  return (key, vars) => {
    const s = dict[key] ?? fr[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)) : s;
  };
}

/** Tout ce qu'il faut pour rendre une page dans la langue du visiteur. */
export const getI18n = cache(async () => {
  const [locale, config] = await Promise.all([getLocale(), getConfig()]);
  setMoneyFormat(config.region.currency, config.region.defaultLocale);
  const dict = await getDictionary(locale);
  return { locale, dict, t: makeT(dict), dir: RTL.has(locale) ? ("rtl" as const) : ("ltr" as const), defaultLocale: config.region.defaultLocale };
});

/** Traduction côté serveur hors requête (e-mails, tâches de fond). */
export async function getT(locale: string): Promise<T> {
  const c = await readConfig();
  setMoneyFormat(c.region.currency, c.region.defaultLocale);
  return makeT(await getDictionary(locale || c.region.defaultLocale));
}
