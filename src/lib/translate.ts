import { createHash } from "node:crypto";
import { readConfig } from "./config";
import { decryptSecret } from "./crypto";
import { db } from "./db";

/**
 * Traduction automatique avec cache en base.
 * Services : DeepL, Google Cloud Translation (v2), LibreTranslate (auto-hébergeable).
 * Une traduction saisie à la main (source MANUAL) n'est jamais remplacée.
 * En cas d'échec du service, le texte d'origine est affiché (jamais d'erreur côté client).
 */

export interface TranslateItem {
  entityType: string;
  entityId: string;
  field: string;
  text: string;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const keyOf = (i: { entityType: string; entityId: string; field: string }) => `${i.entityType}|${i.entityId}|${i.field}`;

type Provider = { name: "deepl" | "google" | "libretranslate"; key: string; endpoint: string };

async function provider(): Promise<Provider | null> {
  const c = (await readConfig()).translation;
  if (c.provider === "none") return null;
  const key = c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : "";
  if (c.provider !== "libretranslate" && !key) return null;
  return { name: c.provider, key, endpoint: c.endpoint };
}

/** Appelle le service de traduction pour une liste de textes (même langue source / cible). */
export async function machineTranslate(texts: string[], target: string, source: string, p?: Provider | null): Promise<string[] | null> {
  const prov = p ?? (await provider());
  if (!prov || !texts.length) return null;
  const signal = AbortSignal.timeout(8000);
  if (prov.name === "deepl") {
    const host = prov.key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const res = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${prov.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts, target_lang: target.toUpperCase(), source_lang: source.toUpperCase(), preserve_formatting: true }),
      signal,
    });
    if (!res.ok) throw new Error(`DeepL ${res.status}`);
    return ((await res.json()) as { translations: { text: string }[] }).translations.map((t) => t.text);
  }
  if (prov.name === "google") {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(prov.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, target, source, format: "text" }),
      signal,
    });
    if (!res.ok) throw new Error(`Google Translate ${res.status}`);
    return ((await res.json()) as { data: { translations: { translatedText: string }[] } }).data.translations.map((t) => t.translatedText);
  }
  const base = (prov.endpoint || "https://libretranslate.com").replace(/\/$/, "");
  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, source, target, format: "text", api_key: prov.key || undefined }),
    signal,
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const body = (await res.json()) as { translatedText: string | string[] };
  return Array.isArray(body.translatedText) ? body.translatedText : [body.translatedText];
}

/**
 * Traductions de plusieurs textes vers `locale`, depuis le cache ; les manquantes (ou dont
 * l'original a changé) sont traduites par lots puis enregistrées. Renvoie clé → texte.
 */
export async function translateMany(items: TranslateItem[], locale: string, opts: { sourceLocale?: string; fetchMissing?: boolean } = {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const source = opts.sourceLocale ?? (await readConfig()).region.defaultLocale;
  const useful = items.filter((i) => i.text.trim());
  if (locale === source || !useful.length) return out;

  const cached = await db.translation.findMany({
    where: { locale, OR: [...new Set(useful.map((i) => i.entityType))].map((entityType) => ({ entityType, entityId: { in: useful.filter((i) => i.entityType === entityType).map((i) => i.entityId) } })) },
  });
  const byKey = new Map(cached.map((t) => [keyOf(t), t]));
  const missing: TranslateItem[] = [];
  for (const i of useful) {
    const t = byKey.get(keyOf(i));
    if (t && (t.source === "MANUAL" || t.sourceHash === hash(i.text))) out.set(keyOf(i), t.text);
    else missing.push(i);
  }
  if (!missing.length || opts.fetchMissing === false) return out;

  const prov = await provider();
  if (!prov) return out;
  // Textes identiques traduits une seule fois ; lots de 50.
  const unique = [...new Set(missing.map((m) => m.text))];
  const translated = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const res = await machineTranslate(batch, locale, source, prov);
      res?.forEach((t, j) => translated.set(batch[j]!, t));
    } catch (e) {
      console.error("[traduction]", (e as Error).message);
      break; // service indisponible : on garde l'original
    }
  }
  for (const m of missing) {
    const text = translated.get(m.text);
    if (!text) continue;
    out.set(keyOf(m), text);
    await db.translation.upsert({
      where: { entityType_entityId_field_locale: { entityType: m.entityType, entityId: m.entityId, field: m.field, locale } },
      create: { entityType: m.entityType, entityId: m.entityId, field: m.field, locale, text, source: "AUTO", sourceHash: hash(m.text) },
      update: { text, sourceHash: hash(m.text) },
    }).catch(() => {});
  }
  return out;
}

export const translationKey = keyOf;
export const sourceHash = hash;
