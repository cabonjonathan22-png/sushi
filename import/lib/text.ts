import { createRequire } from "node:module";

// « he » est un module UMD/CommonJS sans export ESM détectable par Node.
const he = createRequire(import.meta.url)("he") as typeof import("he");

/** Décode les entités HTML (&#8211;, &amp;, &euro;…), normalise accents (NFC) et espaces. */
export function cleanText(s: string): string {
  return he
    .decode(s)
    .normalize("NFC") // le site source contient des accents décomposés (e + ◌́)
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Convertit un fragment HTML en texte brut, en gardant les retours à la ligne. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return he
    .decode(withBreaks)
    .normalize("NFC")
    .split("\n")
    .map((l) => l.replace(/ /g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Slug ASCII stable : « Poké Thon – 6 pièces » → « poke-thon-6-pieces ». */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Prix Store API (« 1090 » en unités mineures) → centimes entiers. */
export function toCents(minor: string, minorUnit = 2): number {
  const n = Number.parseInt(minor, 10);
  if (!Number.isFinite(n)) throw new Error(`Prix invalide : ${minor}`);
  return minorUnit === 2 ? n : Math.round(n * 10 ** (2 - minorUnit));
}

const ALCOOL = /abus d.alcool/i;
export const mentionAlcool = (texte: string) => ALCOOL.test(texte);
