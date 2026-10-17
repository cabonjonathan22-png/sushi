/**
 * Import du site WordPress actuel → import/data.json (+ images WebP).
 *
 *   npm run import:fetch                 # catalogue, textes, images
 *   npm run import:fetch -- --sans-images
 *   npm run import:fetch -- --commandes  # + historique (clé API REST requise)
 *
 * Relançable à volonté : les identifiants sont ceux de WordPress (wpId), les images
 * sont mises en cache et identifiées par leur empreinte ; aucune duplication possible.
 * Le fichier data.json est relu par le client avant toute insertion en base.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllPages, getJson, getText, mapLimit } from "./lib/http.ts";
import { importerImage, type ImageImportee } from "./lib/images.ts";
import { parseOrderPage } from "./lib/orderPage.ts";
import { cleanText, htmlToText, mentionAlcool, slugify, toCents } from "./lib/text.ts";
import { exporterCommandes, lireProduitsWoo, lireReglagesWoo, type WooAuth } from "./lib/woo.ts";
import { parseZones, type CommuneRef } from "./lib/zones.ts";
import { DataJson, type Produit } from "./schema.ts";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
try {
  process.loadEnvFile(path.join(ICI, "..", ".env"));
} catch {
  /* pas de .env : import public uniquement */
}
const BASE = (process.env.WP_BASE_URL ?? "https://yaoma-sushi.com").replace(/\/$/, "");
const STORE = `${BASE}/wp-json/wc/store/v1`;
const avertissements: string[] = [];
const log = (...m: unknown[]) => console.log("•", ...m);

// --- Types (sous-ensemble utile de la Store API) -------------------------------------------
interface StoreImage { src: string; thumbnail: string }
interface StorePrices { price: string; currency_minor_unit: number }
interface StoreCategory { id: number; name: string; slug: string; permalink: string; count: number }
interface StoreProduct {
  id: number; name: string; slug: string; type: string; permalink: string;
  short_description: string; description: string; prices: StorePrices;
  images: StoreImage[]; is_in_stock: boolean;
  attributes: { name: string; terms: { name: string }[] }[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
}

// --- Choix éditoriaux (validés par le client le 17/10/2026) ---------------------------------
const RENOMMAGES_CATEGORIES: Record<string, { nom: string; slug: string; type: "PETITS_PLUS" }> = {
  accompagnements: { nom: "Les petits plus", slug: "petits-plus", type: "PETITS_PLUS" },
};
const JOURS_OUVERTS = [2, 3, 4, 5, 6, 0]; // mardi → dimanche
const PLAGES = [{ debut: "10:00", fin: "14:00" }, { debut: "17:30", fin: "21:30" }];

/** Nouvelles URL (provisoires, figées en phase 9). */
const url = {
  menu: "/commander",
  categorie: (slug: string) => `/commander#${slug}`,
  produit: (slug: string) => `/commander?produit=${slug}`,
};

function slugUnique(base: string, pris: Set<string>): string {
  let s = base || "produit";
  for (let i = 2; pris.has(s); i++) s = `${base}-${i}`;
  pris.add(s);
  return s;
}

function cheminRelatif(u: string): string {
  return new URL(u).pathname;
}

async function main() {
  const auth: WooAuth | null =
    process.env.WC_CONSUMER_KEY && process.env.WC_CONSUMER_SECRET
      ? { base: BASE, opts: { auth: { key: process.env.WC_CONSUMER_KEY, secret: process.env.WC_CONSUMER_SECRET } } }
      : null;
  log(`Source : ${BASE} — API authentifiée : ${auth ? "oui" : "non (Store API publique seulement)"}`);

  // 1. Catalogue ---------------------------------------------------------------------------
  const cats = await getAllPages<StoreCategory>(`${STORE}/products/categories`);
  const produits = await getAllPages<StoreProduct>(`${STORE}/products`);
  log(`${cats.length} catégories, ${produits.length} produits`);

  // Le champ `categories` des produits est parfois vide (ex. les plateaux) :
  // on reconstruit les liens en interrogeant chaque catégorie.
  const catsParProduit = new Map<number, string[]>();
  for (const c of cats) {
    const ids = await getAllPages<{ id: number }>(`${STORE}/products?category=${c.id}`);
    if (ids.length !== c.count) avertissements.push(`Catégorie « ${c.name} » : ${ids.length} produits lus pour ${c.count} annoncés.`);
    for (const { id } of ids) catsParProduit.set(id, [...(catsParProduit.get(id) ?? []), c.slug]);
  }

  // Variations : une requête par variation (prix, stock, image propres).
  const variables = produits.filter((p) => p.type === "variable");
  const variations = new Map<number, StoreProduct>();
  await mapLimit(variables.flatMap((p) => p.variations), 6, async (v) => {
    variations.set(v.id, (await getJson<StoreProduct>(`${STORE}/products/${v.id}`)).data);
  });
  log(`${variations.size} variations`);

  // 2. Page de commande (ordre du menu, badges) et accueil ------------------------------------
  const page = parseOrderPage(await getText(`${BASE}/commander-2/`));
  const surMenu = new Map(page.products.map((p) => [`${p.categorySlug}:${p.wpId}`, p]));
  const infoMenu = new Map(page.products.map((p) => [p.wpId, p]));

  const accueilHtml = await getText(`${BASE}/`);
  const lignes = htmlToText(accueilHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")).split("\n");
  const ligneApres = (re: RegExp) => lignes[lignes.findIndex((l) => re.test(l)) + 1] ?? "";
  const ligne = (re: RegExp) => lignes.find((l) => re.test(l)) ?? "";

  const communes84 = (await getJson<CommuneRef[]>("https://geo.api.gouv.fr/communes?codeDepartement=84&fields=nom,code,codesPostaux")).data;
  const zones = parseZones(lignes, communes84);
  for (const z of zones) {
    if (z.communesNonReconnues.length) avertissements.push(`${z.nom} : communes non reconnues ${z.communesNonReconnues.join(", ")}.`);
  }
  avertissements.push(
    "Zones et minimums repris du texte de l'accueil (20/35 € et 20/40 €). WooCommerce applique aujourd'hui 50 € partout : à confirmer.",
  );

  const adresse = ligneApres(/^on vous attend/i).match(/^(.+?),\s*(\d{5})\s+(.+)$/);
  const telephones = ligne(/^0\d[\d ]{8,}\|/).split("|").map((t) => t.trim()).filter(Boolean);
  const maps = accueilHtml.match(/href="(https:\/\/(?:g\.co|maps\.app\.goo\.gl|www\.google\.[a-z.]+\/maps)[^"]*)"/)?.[1];
  if (!adresse || !telephones.length || !maps) avertissements.push("Adresse, téléphones ou lien Maps non trouvés sur l'accueil : à compléter.");
  if (/href="tel:33/.test(accueilHtml)) avertissements.push("Le lien d'appel du site actuel est faux (tel:33… sans « + ») : corrigé en tel:+33….");

  // 3. API authentifiée (facultatif) ---------------------------------------------------------
  let wooProduits = new Map<number, Record<string, unknown>>();
  let reglagesWoo: Record<string, unknown> | null = null;
  if (auth) {
    wooProduits = await lireProduitsWoo(auth);
    reglagesWoo = await lireReglagesWoo(auth);
    log(`API authentifiée : ${wooProduits.size} produits, réglages lus`);
    if (args.has("--commandes")) {
      const n = await exporterCommandes(auth, path.join(ICI, "private"));
      log(`Historique : ${n.commandes} commandes, ${n.clients} clients → import/private/`);
    }
  } else {
    avertissements.push("Allergènes, classes de TVA et réglages WooCommerce non lus : fournir une clé API REST (lecture).");
    if (args.has("--commandes")) avertissements.push("--commandes ignoré : clé API REST absente.");
  }

  // 4. Images ------------------------------------------------------------------------------
  const sources = new Map<string, { thumb?: string; carre: boolean }>();
  for (const p of [...produits, ...variations.values()]) for (const i of p.images) sources.set(i.src, { thumb: i.thumbnail, carre: true });
  const imagesAccueil = [...new Set(
    [...accueilHtml.matchAll(/https:\/\/[^"')\s]+\/wp-content\/uploads\/[^"')\s]+\.(?:jpe?g|png|webp)/gi)].map((m) => m[0]),
  )].filter((u) => !/Shape|logo/i.test(u));
  const postCss = [...accueilHtml.matchAll(/href='([^']+\/elementor\/css\/post-89\.css[^']*)'/g)].map((m) => m[1]!);
  for (const css of postCss) {
    const txt = await getText(css);
    for (const m of txt.matchAll(/url\("?(https:[^")]+\.(?:jpe?g|png|webp))"?\)/gi)) if (!/Shape/i.test(m[1]!)) imagesAccueil.push(m[1]!);
  }
  for (const u of imagesAccueil) if (!sources.has(u)) sources.set(u, { carre: false });

  const parSrc = new Map<string, ImageImportee>();
  if (!args.has("--sans-images")) {
    const dirs = { cache: path.join(ICI, "cache", "originals"), out: path.join(ICI, "images") };
    const liste = [...sources.entries()];
    let faites = 0;
    await mapLimit(liste, 6, async ([src, { thumb, carre }]) => {
      try {
        parSrc.set(src, await importerImage(src, thumb, dirs, carre));
      } catch (e) {
        avertissements.push((e as Error).message);
      }
      if (++faites % 20 === 0) log(`images ${faites}/${liste.length}`);
    });
    for (const img of parSrc.values()) if (img.depuisMiniature) avertissements.push(`Image ${img.nomOrigine} : original introuvable, miniature utilisée.`);
    log(`${parSrc.size} images traitées`);
  }
  const imageId = (src?: string) => (src ? parSrc.get(src)?.id ?? null : null);

  // 5. Catégories --------------------------------------------------------------------------
  const ordreCat = (slug: string) => {
    const i = page.categories.indexOf(slug);
    return i === -1 ? 100 + cats.findIndex((c) => c.slug === slug) : i;
  };
  const categories = cats
    .map((c) => {
      const r = RENOMMAGES_CATEGORIES[c.slug];
      const nomOrigine = cleanText(c.name);
      const visible = page.categories.includes(c.slug);
      if (!visible) avertissements.push(`Catégorie « ${nomOrigine} » absente de la page de commande : importée masquée.`);
      return {
        wpId: c.id,
        slug: r?.slug ?? slugify(nomOrigine),
        ancienSlug: c.slug,
        ancienneUrl: cheminRelatif(c.permalink),
        nom: r?.nom ?? nomOrigine,
        nomOrigine,
        ordre: ordreCat(c.slug),
        visible,
        type: r?.type ?? ("NORMALE" as const),
      };
    })
    .sort((a, b) => a.ordre - b.ordre)
    .map((c, i) => ({ ...c, ordre: i }));
  const nouveauSlugCat = new Map(categories.map((c) => [c.ancienSlug, c.slug]));

  // 6. Produits ----------------------------------------------------------------------------
  const slugsPris = new Set<string>();
  const sortie: Produit[] = [];
  for (const p of [...produits].sort((a, b) => a.id - b.id)) {
    const nomOrigine = cleanText(p.name);
    const nom = nomOrigine.replace(/\s+/g, " ");
    const menu = infoMenu.get(p.id);
    const descBrute = htmlToText(p.short_description);
    const alcool =
      mentionAlcool(descBrute) || !!menu?.alcool ||
      (/\b(bi[eè]re|beer|vins?)\b/i.test(nom) && !/sans alcool/i.test(nom));
    // La mention légale sera affichée automatiquement pour tout produit « alcool ».
    const descriptionCourte = descBrute.split("\n").filter((l) => !mentionAlcool(l)).join("\n");

    const slugsCat = catsParProduit.get(p.id) ?? [];
    if (!slugsCat.length) avertissements.push(`Produit « ${nom} » (#${p.id}) sans catégorie.`);
    const wp = wooProduits.get(p.id);

    sortie.push({
      wpId: p.id,
      slug: slugUnique(slugify(nom), slugsPris),
      ancienSlug: p.slug,
      ancienneUrl: cheminRelatif(p.permalink),
      nom,
      nomOrigine,
      descriptionCourte,
      description: htmlToText(p.description),
      prix: toCents(p.prices.price, p.prices.currency_minor_unit),
      // Taux réel WooCommerce si connu (classe « taux-boissons » = 20 %), sinon règle par défaut.
      tauxTva: wp ? (wp.tax_class === "taux-boissons" ? 20 : 10) : alcool ? 20 : 10,
      categories: slugsCat.map((s) => ({
        slug: nouveauSlugCat.get(s) ?? s,
        ordre: surMenu.get(`${s}:${p.id}`)?.position ?? 999,
      })),
      imageId: imageId(p.images[0]?.src),
      enRupture: !p.is_in_stock,
      visibleSurMenu: !!menu,
      badges: menu?.labels ?? [],
      allergenes: [],
      alcool,
      attributs: p.attributes.map((a) => ({ nom: cleanText(a.name), valeurs: a.terms.map((t) => cleanText(t.name)) })),
      variantes: p.variations.map((v) => {
        const d = variations.get(v.id);
        if (!d) throw new Error(`Variation #${v.id} non récupérée`);
        const img = d.images[0]?.src;
        return {
          wpId: v.id,
          attributs: Object.fromEntries(v.attributes.map((a) => [cleanText(a.name), cleanText(a.value)])),
          prix: toCents(d.prices.price, d.prices.currency_minor_unit),
          enRupture: !d.is_in_stock,
          imageId: img && img !== p.images[0]?.src ? imageId(img) : null,
        };
      }),
      ...(wp ? { wp } : {}),
    });
    if (!menu) avertissements.push(`Produit « ${nom} » absent de la page de commande : à archiver ou à vérifier.`);
  }
  avertissements.push(
    auth
      ? "TVA reprise de WooCommerce : 10 % nourriture, 20 % pour TOUTES les boissons (eaux et sodas compris). Seul l'alcool relève normalement de 20 % (sodas : 10 %, ou 5,5 % en contenant fermé) : à valider par le comptable."
      : "TVA proposée : 10 % (restauration à emporter / livrée), 20 % pour l'alcool. Boissons sans alcool en contenant fermé : 5,5 % possible. À valider par le comptable.",
  );

  const ordreAffichage = new Map(categories.map((c) => [c.slug, c.ordre]));
  const cle = (p: Produit) => {
    const c = p.categories[0];
    return c ? (ordreAffichage.get(c.slug) ?? 999) * 1000 + c.ordre : 999_999;
  };
  sortie.sort((a, b) => cle(a) - cle(b) || a.wpId - b.wpId);

  // 7. Redirections 301 (anciennes URL WordPress → nouvelles) --------------------------------
  const redirections = [
    { de: "/commander-2/", vers: url.menu },
    { de: "/commander/", vers: url.menu },
    { de: "/panier/", vers: url.menu },
    { de: "/boutique/", vers: url.menu },
    { de: "/mon-compte/", vers: "/compte" },
    { de: "/accompagnements-2/", vers: url.categorie("petits-plus") },
    ...["/sample-page/", "/gallery/", "/whats-on/", "/our-story/", "/food-drinks/", "/2025/04/01/hello-world/", "/category/uncategorized/", "/product-labels/vegetarien/"]
      .map((de) => ({ de, vers: "/" })),
    ...categories.map((c) => ({ de: c.ancienneUrl, vers: url.categorie(c.slug) })),
    ...sortie.map((p) => ({ de: p.ancienneUrl, vers: url.produit(p.slug) })),
  ];

  // 8. Assemblage, validation, écriture ------------------------------------------------------
  const images = [...new Map([...parSrc.values()].map((i) => [i.id, i])).values()].sort((a, b) => a.nomOrigine.localeCompare(b.nomOrigine));
  const titreCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  const data: DataJson = {
    meta: {
      source: BASE,
      genereLe: new Date().toISOString(),
      apiAuthentifiee: !!auth,
      compteurs: {
        categories: categories.length,
        produits: sortie.length,
        variantes: sortie.reduce((n, p) => n + p.variantes.length, 0),
        enRupture: sortie.filter((p) => p.enRupture).length,
        images: images.length,
        redirections: redirections.length,
      },
      avertissements,
    },
    restaurant: {
      slug: "cucuron",
      nom: "Yaoma Sushi",
      adresse: adresse
        ? { rue: adresse[1]!.replace(/\bl['’]étang\b/i, "l’Étang"), codePostal: adresse[2]!, ville: titreCase(adresse[3]!) }
        : { rue: "", codePostal: "", ville: "" },
      telephones,
      lienGoogleMaps: maps ?? "https://maps.google.com",
      horaires: JOURS_OUVERTS.map((jour) => ({ jour, plages: PLAGES })),
      services: { surPlace: true, retrait: true, livraison: true },
      zones,
      sources: {
        nom: "Confirmé par le client le 17/10/2026 (Yaoma Sushi, et non Kiyo Sushi)",
        horaires: "Confirmé par le client le 17/10/2026 : mardi → dimanche, 10h-14h et 17h30-21h30",
        zones: "Texte de la page d'accueil, communes rapprochées du référentiel geo.api.gouv.fr",
      },
    },
    pageAccueil: {
      titre: ligne(/^cuisine japonaise$/i),
      accroche: [ligne(/^un voyage culinaire/i), ligneApres(/^un voyage culinaire/i)].join(" ").trim(),
      presentation: ligne(/^bienvenue/i),
      engagement: ligne(/^notre priorit/i).replace(/\s+([,.])/g, "$1"),
      imageIds: [...new Set(imagesAccueil.map((u) => imageId(u)).filter((x): x is string => !!x))],
    },
    categories,
    produits: sortie,
    images,
    reglagesWoo,
    redirections,
  };

  const valide = DataJson.parse(data);
  const fichier = path.join(ICI, "data.json");
  await writeFile(fichier, JSON.stringify(valide, null, 2) + "\n");
  log(`Écrit ${path.relative(process.cwd(), fichier)} :`, JSON.stringify(valide.meta.compteurs));
  log(`${avertissements.length} avertissement(s) à relire dans meta.avertissements`);
}

main().catch((e) => {
  console.error("✖ Import interrompu :", e);
  process.exit(1);
});
