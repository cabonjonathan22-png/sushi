import { cleanText, htmlToText, mentionAlcool } from "./text.ts";

export interface OrderPageProduct {
  wpId: number;
  categorySlug: string;
  /** Position dans la catégorie (0, 1, 2…) telle qu'affichée sur /commander-2/. */
  position: number;
  /** Étiquettes Orderable (« Végétarien »…). */
  labels: { slug: string; texte: string; couleur?: string; fond?: string }[];
  description: string;
  alcool: boolean;
}

export interface OrderPage {
  /** Slugs de catégories dans l'ordre d'affichage. */
  categories: string[];
  products: OrderPageProduct[];
}

/**
 * Lit la page de commande Orderable (/commander-2/) : c'est la seule source fiable
 * de l'ordre du menu (le menu_order WooCommerce n'est pas renseigné).
 * Chaque produit est dans un bloc `orderable-products-list__item`, précédé de
 * l'ancre `id="category-<slug>"` de sa catégorie.
 */
export function parseOrderPage(html: string): OrderPage {
  const categories: string[] = [];
  const products: OrderPageProduct[] = [];
  const seen = new Set<string>();
  let current = "";
  const counters = new Map<string, number>();

  // On découpe sur les ancres de catégorie ET les blocs produit, en gardant l'ordre du document.
  const tokens = html.split(/(?=id="category-[^"]+")|(?=<div class="orderable-products-list__item">)/);
  for (const chunk of tokens) {
    const cat = chunk.match(/^id="category-([^"]+)"/);
    if (cat) {
      current = cat[1]!;
      if (!categories.includes(current)) categories.push(current);
      continue;
    }
    if (!chunk.startsWith('<div class="orderable-products-list__item">') || !current) continue;
    const id = chunk.match(/class="orderable-product[^"]*"\s+data-orderable-product-id="(\d+)"/);
    if (!id) continue;
    const wpId = Number(id[1]);
    const key = `${current}:${wpId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const position = counters.get(current) ?? 0;
    counters.set(current, position + 1);

    const labels = [...chunk.matchAll(
      /orderable-pro-product-labels__label-([a-z0-9-]+)"(?:\s+style="([^"]*)")?[\s\S]*?orderable-pro-product-labels__text">([\s\S]*?)<\/span>/g,
    )].map((m) => ({
      slug: m[1]!,
      texte: cleanText(m[3]!),
      couleur: m[2]?.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1]?.trim(),
      fond: m[2]?.match(/background-color:\s*([^;]+)/)?.[1]?.trim(),
    }));
    const desc = chunk.match(/<p class="orderable-product__description">([\s\S]*?)<\/p>/);
    const description = desc ? htmlToText(desc[1]!) : "";
    products.push({ wpId, categorySlug: current, position, labels, description, alcool: mentionAlcool(description) });
  }
  return { categories, products };
}
