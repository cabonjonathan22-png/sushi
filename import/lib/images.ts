import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { get } from "./http.ts";

/** Largeurs WebP des photos produits (carrées) : vignette, carte menu, fenêtre produit, zoom. */
export const TAILLES_PRODUIT = [160, 320, 640, 1200] as const;
/** Largeurs WebP des images de page (bandeaux), proportions d'origine conservées. */
export const TAILLES_PAGE = [640, 1280, 1920] as const;

/**
 * URL de l'original WordPress : retire le suffixe de miniature « -300x300 »
 * (ex. HAPPY_BOX_result-300x300.jpg → HAPPY_BOX_result.jpg).
 */
export function originalUrl(url: string): string {
  return url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
}

/** Nom de fichier d'origine sans extension, nettoyé (sert de base aux fichiers WebP). */
export function baseName(url: string): string {
  const file = decodeURIComponent(url.split("/").pop() ?? "image");
  return file.replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-");
}

export interface ImageImportee {
  /** sha256 (16 premiers caractères) du fichier original : identifiant stable. */
  id: string;
  nomOrigine: string;
  urlOrigine: string;
  /** true si l'original était introuvable et qu'on a pris la miniature. */
  depuisMiniature: boolean;
  largeur: number;
  hauteur: number;
  fichiers: Record<string, string>;
}

/**
 * Télécharge l'original (repli sur la miniature si 404), le met en cache et génère
 * les WebP (carrés pour les produits). Relançable : rien n'est retéléchargé ni régénéré si déjà présent.
 */
export async function importerImage(
  url: string,
  thumbnail: string | undefined,
  dirs: { cache: string; out: string },
  carre = true,
): Promise<ImageImportee> {
  const candidats = [originalUrl(url), url, thumbnail].filter((u): u is string => !!u);
  const uniques = [...new Set(candidats)];
  let buffer: Buffer | undefined;
  let source = "";
  for (const u of uniques) {
    const cached = path.join(dirs.cache, baseName(u) + path.extname(new URL(u).pathname));
    if (existsSync(cached)) {
      buffer = await readFile(cached);
      source = u;
      break;
    }
    const res = await get(u);
    if (!res.ok) continue;
    buffer = Buffer.from(await res.arrayBuffer());
    await mkdir(dirs.cache, { recursive: true });
    await writeFile(cached, buffer);
    source = u;
    break;
  }
  if (!buffer) throw new Error(`Image introuvable : ${uniques.join(" | ")}`);

  const id = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const base = baseName(source);
  const meta = await sharp(buffer).metadata();
  const fichiers: Record<string, string> = {};
  await mkdir(dirs.out, { recursive: true });
  for (const w of carre ? TAILLES_PRODUIT : TAILLES_PAGE) {
    const nom = `${base}-${id.slice(0, 6)}-${w}.webp`;
    const cible = path.join(dirs.out, nom);
    if (!existsSync(cible)) {
      // Produits : recadrage carré sur la zone d'intérêt. Pages : largeur seule.
      // Jamais d'agrandissement au-delà de l'original.
      await sharp(buffer)
        .rotate()
        .resize(carre
          ? { width: w, height: w, fit: "cover", position: "attention", withoutEnlargement: true }
          : { width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(cible);
    }
    fichiers[w] = nom;
  }
  return {
    id,
    nomOrigine: decodeURIComponent(source.split("/").pop() ?? ""),
    urlOrigine: source,
    depuisMiniature: source === thumbnail && source !== originalUrl(url),
    largeur: meta.width ?? 0,
    hauteur: meta.height ?? 0,
    fichiers,
  };
}
