import { z } from "zod";

/**
 * Contrat du fichier import/data.json : produit par `npm run import:fetch`,
 * relu par le client, puis inséré en base par l'étape « import:db » (phase 2).
 * Tous les montants sont en centimes TTC.
 */

const Centimes = z.number().int().nonnegative();

export const Plage = z.object({ debut: z.string().regex(/^\d{2}:\d{2}$/), fin: z.string().regex(/^\d{2}:\d{2}$/) });

export const Commune = z.object({ nom: z.string(), codeInsee: z.string(), codePostal: z.string() });

export const Zone = z.object({
  nom: z.string(),
  communes: z.array(Commune),
  /** Noms lus sur le site mais non reconnus dans le référentiel officiel. */
  communesNonReconnues: z.array(z.string()),
  minimumMidi: Centimes.nullable(),
  minimumSoir: Centimes.nullable(),
  fraisLivraison: Centimes,
  seuilLivraisonGratuite: Centimes.nullable(),
});

export const Restaurant = z.object({
  slug: z.string(),
  nom: z.string(),
  adresse: z.object({ rue: z.string(), codePostal: z.string(), ville: z.string() }),
  telephones: z.array(z.string()),
  lienGoogleMaps: z.string().url(),
  /** 0 = dimanche … 6 = samedi. */
  horaires: z.array(z.object({ jour: z.number().int().min(0).max(6), plages: z.array(Plage) })),
  services: z.object({ surPlace: z.boolean(), retrait: z.boolean(), livraison: z.boolean() }),
  zones: z.array(Zone),
  sources: z.record(z.string(), z.string()),
});

export const Categorie = z.object({
  wpId: z.number().int(),
  slug: z.string(),
  ancienSlug: z.string(),
  ancienneUrl: z.string(),
  nom: z.string(),
  nomOrigine: z.string(),
  ordre: z.number().int(),
  /** false si la catégorie n'apparaît pas sur la page de commande actuelle. */
  visible: z.boolean(),
  type: z.enum(["NORMALE", "PETITS_PLUS"]),
});

export const Variante = z.object({
  wpId: z.number().int(),
  attributs: z.record(z.string(), z.string()),
  prix: Centimes,
  enRupture: z.boolean(),
  imageId: z.string().nullable(),
});

export const Produit = z.object({
  wpId: z.number().int(),
  slug: z.string(),
  ancienSlug: z.string(),
  ancienneUrl: z.string(),
  nom: z.string(),
  nomOrigine: z.string(),
  descriptionCourte: z.string(),
  description: z.string(),
  prix: Centimes,
  /** Taux de TVA proposé en pourcentage (10 = 10 %). À valider par le comptable. */
  tauxTva: z.number(),
  categories: z.array(z.object({ slug: z.string(), ordre: z.number().int() })),
  imageId: z.string().nullable(),
  enRupture: z.boolean(),
  /** Visible sur la page de commande actuelle (sinon : à archiver ou à vérifier). */
  visibleSurMenu: z.boolean(),
  badges: z.array(z.object({ slug: z.string(), texte: z.string(), couleur: z.string().optional(), fond: z.string().optional() })),
  /** Codes des 14 allergènes réglementaires (vide = non renseigné sur l'ancien site). */
  allergenes: z.array(z.string()),
  alcool: z.boolean(),
  attributs: z.array(z.object({ nom: z.string(), valeurs: z.array(z.string()) })),
  variantes: z.array(Variante),
  /** Données brutes de l'API REST authentifiée, si une clé a été fournie. */
  wp: z.record(z.string(), z.unknown()).optional(),
});

export const Image = z.object({
  id: z.string(),
  nomOrigine: z.string(),
  urlOrigine: z.string(),
  depuisMiniature: z.boolean(),
  largeur: z.number().int(),
  hauteur: z.number().int(),
  fichiers: z.record(z.string(), z.string()),
});

export const DataJson = z.object({
  meta: z.object({
    source: z.string(),
    genereLe: z.string(),
    apiAuthentifiee: z.boolean(),
    compteurs: z.record(z.string(), z.number()),
    avertissements: z.array(z.string()),
  }),
  restaurant: Restaurant,
  pageAccueil: z.object({
    titre: z.string(),
    accroche: z.string(),
    presentation: z.string(),
    engagement: z.string(),
    imageIds: z.array(z.string()),
  }),
  categories: z.array(Categorie),
  produits: z.array(Produit),
  images: z.array(Image),
  /** Réglages lus dans WooCommerce (API authentifiée uniquement), pour comparaison. */
  reglagesWoo: z.record(z.string(), z.unknown()).nullable(),
  redirections: z.array(z.object({ de: z.string(), vers: z.string() })),
});

export type DataJson = z.infer<typeof DataJson>;
export type Produit = z.infer<typeof Produit>;
export type Zone = z.infer<typeof Zone>;
