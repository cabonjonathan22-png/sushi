import { createHash } from "node:crypto";
import { readConfig } from "./config";
import { decryptSecret } from "./crypto";
import { db } from "./db";

/**
 * Traduction automatique avec cache en base.
 * Services : MyMemory (gratuit, sans inscription : service par défaut), DeepL, Google Cloud
 * Translation (v2), LibreTranslate (auto-hébergeable).
 * Chaque texte n'est traduit qu'une fois (cache) ; une traduction saisie à la main (MANUAL)
 * n'est jamais remplacée. En cas d'échec du service, le texte d'origine est affiché.
 */

export interface TranslateItem {
  entityType: string;
  entityId: string;
  field: string;
  text: string;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const keyOf = (i: { entityType: string; entityId: string; field: string }) => `${i.entityType}|${i.entityId}|${i.field}`;

type ProviderName = "mymemory" | "deepl" | "google" | "libretranslate";
type Provider = { name: ProviderName; key: string; endpoint: string; email: string };

/** Quota journalier du service gratuit atteint : on réessaiera plus tard (le lendemain). */
export class QuotaError extends Error {}

async function provider(): Promise<Provider | null> {
  const c = (await readConfig()).translation;
  if (c.provider === "none") return null;
  const key = c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : "";
  if ((c.provider === "deepl" || c.provider === "google") && !key) return null;
  return { name: c.provider, key, endpoint: c.endpoint, email: c.email };
}

/** Décodage des entités HTML renvoyées par MyMemory (« l&#39;huile »). */
function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return named[e.toLowerCase()] ?? m;
  });
}

const MYMEMORY_LANG: Record<string, string> = { zh: "zh-CN", pt: "pt-PT" };

/** MyMemory : un texte par requête (500 caractères max ; les textes plus longs sont découpés par phrases). */
async function myMemory(text: string, target: string, source: string, email: string): Promise<string> {
  const chunks: string[] = [];
  for (const sentence of text.match(/[^.!?\n]+[.!?\n]*\s*/g) ?? [text]) {
    const last = chunks.at(-1);
    if (last !== undefined && (last + sentence).length <= 450) chunks[chunks.length - 1] = last + sentence;
    else chunks.push(sentence.slice(0, 450));
  }
  const out: string[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({ q: chunk.trim(), langpair: `${MYMEMORY_LANG[source] ?? source}|${MYMEMORY_LANG[target] ?? target}` });
    if (email) params.set("de", email);
    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) throw new QuotaError("MyMemory : quota atteint");
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const body = (await res.json()) as { responseStatus: number | string; responseData?: { translatedText?: string }; quotaFinished?: boolean };
    const t = body.responseData?.translatedText ?? "";
    if (body.quotaFinished || /MYMEMORY WARNING|USED ALL AVAILABLE FREE/i.test(t)) throw new QuotaError("MyMemory : quota journalier atteint");
    if (Number(body.responseStatus) !== 200 || !t) throw new Error(`MyMemory : ${t || body.responseStatus}`);
    out.push(decodeEntities(t));
  }
  // Respecte les espaces et retours à la ligne d'origine entre les morceaux.
  return out.map((t, i) => t + (chunks[i]!.match(/\s*$/)?.[0] ?? "")).join("").trim();
}

/** Appelle le service de traduction pour une liste de textes (même langue source / cible). */
export async function machineTranslate(texts: string[], target: string, source: string, p?: Provider | null): Promise<string[] | null> {
  const prov = p ?? (await provider());
  if (!prov || !texts.length) return null;
  const signal = AbortSignal.timeout(15000);
  if (prov.name === "mymemory") {
    // 4 requêtes en parallèle : rapide, sans dépasser la limite de débit du service gratuit.
    const results: string[] = new Array(texts.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, texts.length) }, async () => {
      while (next < texts.length) {
        const i = next++;
        results[i] = await myMemory(texts[i]!, target, source, prov.email);
      }
    }));
    return results;
  }
  if (prov.name === "deepl") {
    const host = prov.key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const res = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${prov.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts, target_lang: target.toUpperCase(), source_lang: source.toUpperCase(), preserve_formatting: true }),
      signal,
    });
    if (res.status === 456) throw new QuotaError("DeepL : quota atteint");
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

/** Traductions en cours (par langue) : évite de lancer deux fois le même travail en parallèle. */
const running = new Set<string>();

/**
 * Traduit et enregistre les textes manquants, par lots (la progression est conservée
 * même si le travail est interrompu). Renvoie le nombre de textes traduits.
 */
async function fill(missing: TranslateItem[], locale: string, source: string, prov: Provider, out?: Map<string, string>): Promise<number> {
  const unique = [...new Set(missing.map((m) => m.text))];
  const size = prov.name === "mymemory" ? 12 : 50;
  let done = 0;
  for (let i = 0; i < unique.length; i += size) {
    const batch = unique.slice(i, i + size);
    let res: string[] | null;
    try {
      res = await machineTranslate(batch, locale, source, prov);
    } catch (e) {
      console.error("[traduction]", (e as Error).message);
      break; // quota atteint ou service indisponible : on garde l'original, reprise plus tard
    }
    const translated = new Map(batch.map((t, j) => [t, res?.[j] ?? ""]));
    for (const m of missing) {
      const text = translated.get(m.text);
      if (!text) continue;
      out?.set(keyOf(m), text);
      done++;
      await db.translation.upsert({
        where: { entityType_entityId_field_locale: { entityType: m.entityType, entityId: m.entityId, field: m.field, locale } },
        create: { entityType: m.entityType, entityId: m.entityId, field: m.field, locale, text, source: "AUTO", sourceHash: hash(m.text) },
        update: { text, sourceHash: hash(m.text) },
      }).catch(() => {});
    }
  }
  return done;
}

/** Lance un travail après l'envoi de la réponse (Vercel : after()), sinon en tâche de fond. */
function later(job: () => Promise<unknown>) {
  import("next/server")
    .then(({ after }) => after(job))
    .catch(() => { job().catch(() => {}); });
}

/**
 * Traductions de plusieurs textes vers `locale`, depuis le cache. Les manquantes (ou dont
 * l'original a changé) sont traduites puis enregistrées :
 *  - immédiatement s'il y en a peu (ou si `wait` est demandé, ex. bouton « Tout traduire ») ;
 *  - sinon en arrière-plan, après l'envoi de la page : le visiteur voit l'original cette
 *    fois-ci, puis la traduction aux visites suivantes. La page n'est jamais ralentie.
 */
export async function translateMany(items: TranslateItem[], locale: string, opts: { sourceLocale?: string; fetchMissing?: boolean; wait?: boolean } = {}): Promise<Map<string, string>> {
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
  if (opts.wait || missing.length <= 6) {
    await fill(missing, locale, source, prov, out);
    return out;
  }
  const job = `${locale}|${source}|${[...new Set(missing.map((m) => m.entityType))].sort().join(",")}`;
  if (!running.has(job)) {
    running.add(job);
    later(() => fill(missing, locale, source, prov).finally(() => running.delete(job)));
  }
  return out;
}

export const translationKey = keyOf;
export const sourceHash = hash;
