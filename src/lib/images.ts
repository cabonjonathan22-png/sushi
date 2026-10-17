import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { db } from "./db";
import { mediaUrl, putFile } from "./storage";

/** Tailles WebP générées pour les photos produit (carrées). */
export const PRODUCT_SIZES = [160, 320, 640, 1200] as const;
/** Tailles des images de page (bandeau d'accueil). */
export const BANNER_SIZES = [640, 1280, 1920] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);

export type ImageFiles = Record<string, string>;

/**
 * Upload contrôlé : taille max, type réel vérifié par décodage (pas l'extension),
 * ré-encodage systématique en WebP (supprime métadonnées EXIF / GPS et tout contenu
 * malveillant), recadrage carré automatique centré sur le sujet.
 */
export async function storeProductImage(input: Buffer, originalName: string, opts: { banner?: boolean } = {}): Promise<string> {
  if (input.length > MAX_UPLOAD_BYTES) throw new Error("Image trop lourde (8 Mo maximum).");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new Error("Ce fichier n'est pas une image valide.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new Error("Format non accepté (JPEG, PNG, WebP, HEIC).");

  const hash = createHash("sha256").update(input).update(opts.banner ? "banner" : "").digest("hex").slice(0, 16);
  const existing = await db.image.findUnique({ where: { hash } });
  if (existing) return existing.id;

  const base = originalName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "image";
  const files: ImageFiles = {};
  for (const w of opts.banner ? BANNER_SIZES : PRODUCT_SIZES) {
    // Produit : carré centré sur le sujet. Bandeau : proportions d'origine.
    const out = await sharp(input).rotate()
      .resize(opts.banner ? { width: w, withoutEnlargement: true } : { width: w, height: w, fit: "cover", position: "attention", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    const key = `${opts.banner ? "pages" : "products"}/${base}-${hash.slice(0, 6)}-${w}.webp`;
    await putFile(key, out, "image/webp");
    files[w] = key;
  }
  const img = await db.image.create({
    data: { hash, originalName: originalName.slice(0, 200), width: meta.width ?? 0, height: meta.height ?? 0, files },
  });
  return img.id;
}

/** src + srcset pour une balise <img>. */
export function imageSources(files: ImageFiles | null | undefined, preferred = 320): { src: string; srcSet: string } | null {
  if (!files) return null;
  const widths = Object.keys(files).map(Number).sort((a, b) => a - b);
  if (!widths.length) return null;
  const pick = widths.find((w) => w >= preferred) ?? widths.at(-1)!;
  return {
    src: mediaUrl(files[pick]!),
    srcSet: widths.map((w) => `${mediaUrl(files[w]!)} ${w}w`).join(", "),
  };
}
