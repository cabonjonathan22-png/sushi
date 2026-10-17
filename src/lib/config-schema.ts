import { z } from "zod";

/**
 * Configuration générale réglable dans le back-office (écran « Configuration »).
 * Chaque valeur a un défaut : une configuration vide = comportement d'origine.
 * Fichier sans dépendance serveur : utilisable côté navigateur pour les types.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB");

export const BadgeDef = z.object({
  code: z.string().regex(/^[A-Z0-9_]{2,30}$/, "Code : majuscules, chiffres, _"),
  label: z.string().trim().min(1).max(30),
  color: hex,
});
export type BadgeDef = z.infer<typeof BadgeDef>;

export const VatRateDef = z.object({ value: z.number().int().min(0).max(3000), label: z.string().trim().min(1).max(120) });

const STATUSES = ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const;

export const ConfigSchema = z.object({
  orders: z.object({
    /** Les commandes arrivent directement « Acceptées » (pas de clic « Accepter »). */
    autoAccept: z.boolean().default(false),
    /** E-mail obligatoire à la commande (sinon facultatif : pas d'e-mail de confirmation). */
    requireEmail: z.boolean().default(true),
    /** Note libre pour la cuisine autorisée. */
    allowNotes: z.boolean().default(true),
    /** Statuts qui déclenchent un e-mail au client. */
    notifyStatuses: z.array(z.enum(STATUSES)).default(["ACCEPTED", "READY", "OUT_FOR_DELIVERY", "CANCELLED"]),
    /** Paiement en ligne non finalisé : annulation après X minutes (créneau libéré). */
    pendingPaymentMinutes: z.number().int().min(10).max(24 * 60).default(60),
    /** Quantité maximum d'un même produit sur une ligne. */
    maxLineQuantity: z.number().int().min(1).max(500).default(50),
  }).prefault({}),
  schedule: z.object({
    /** Les plages qui commencent avant cette heure sont « midi », les autres « soir ». */
    lunchDinnerCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("16:00"),
  }).prefault({}),
  printing: z.object({
    /** Nombre minimum d'exemplaires pour une livraison (cuisine + livreur). */
    deliveryCopies: z.number().int().min(1).max(3).default(2),
    /** Répétition de la sonnerie tant qu'une commande reste « Nouvelle » (secondes, 0 = jamais). */
    chimeRepeatSeconds: z.number().int().min(0).max(600).default(20),
  }).prefault({}),
  site: z.object({
    seoTitle: z.string().max(70).default("Yaoma Sushi — Restaurant japonais à Cucuron"),
    seoDescription: z.string().max(170).default("Sushis, makis, poké et plats japonais faits maison à Cucuron. Commande en ligne : à emporter ou en livraison."),
    footerText: z.string().max(300).default("Cuisine japonaise faite maison, préparée à la commande. Sur place, à emporter ou en livraison."),
    /** Bandeau d'annonce en haut de toutes les pages (fermeture, nouveauté…). */
    announcement: z.string().max(200).default(""),
    announcementActive: z.boolean().default(false),
    facebookUrl: z.union([z.literal(""), z.string().url()]).default(""),
    instagramUrl: z.union([z.literal(""), z.string().url()]).default(""),
    googleReviewUrl: z.union([z.literal(""), z.string().url()]).default(""),
    /** Type de cuisine (référencement Google, ex. « Japonaise », « Pizzeria », « Burger »). */
    cuisine: z.string().max(60).default("Japonaise"),
    /** Texte d'aide sous les « petits plus » dans le panier. */
    extrasHint: z.string().max(120).default("Sauces, wasabi, gingembre, baguettes… pensez-y !"),
    /** Exemples dans la recherche du menu et la note pour la cuisine. */
    searchPlaceholder: z.string().max(80).default("saumon, poké, végétarien…"),
    notesPlaceholder: z.string().max(80).default("Sans sésame, allergie…"),
  }).prefault({}),
  catalog: z.object({
    badges: z.array(BadgeDef).max(20).default([
      { code: "VEGETARIAN", label: "Végétarien", color: "#15803d" },
      { code: "VEGAN", label: "Vegan", color: "#166534" },
      { code: "SPICY", label: "Épicé", color: "#b91c1c" },
      { code: "NEW", label: "Nouveau", color: "#b23510" },
      { code: "POPULAR", label: "Populaire", color: "#0b0b0b" },
      { code: "CHEF", label: "Coup de cœur", color: "#d97706" },
    ]),
    vatRates: z.array(VatRateDef).min(1).max(8).default([
      { value: 550, label: "5,5 % (boissons sans alcool en contenant fermé, produits non consommés de suite)" },
      { value: 1000, label: "10 % (plats à emporter, livrés ou sur place)" },
      { value: 2000, label: "20 % (boissons alcoolisées)" },
    ]),
  }).prefault({}),
  region: z.object({
    /** Pays (ISO 3166, ex. FR, BE, US) : formats d'adresse, autocomplétion (France uniquement). */
    country: z.string().regex(/^[A-Z]{2}$/).default("FR"),
    /** Devise (ISO 4217, ex. EUR, USD, GBP, CHF, CAD). */
    currency: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
    /** Langue du restaurant : back-office, tickets, contenu saisi (ex. fr, en, es). */
    defaultLocale: z.string().regex(/^[a-z]{2}$/).default("fr"),
    /** Langues proposées aux clients (sélecteur). */
    languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(30).default(["fr", "en", "es", "de", "it"]),
    /** Afficher le site dans la langue de l'appareil du client (si proposée). */
    autoDetect: z.boolean().default(true),
  }).prefault({}),
  translation: z.object({
    /** Service de traduction automatique du contenu (plats, catégories, textes). */
    provider: z.enum(["none", "deepl", "google", "libretranslate"]).default("none"),
    /** Clé API chiffrée (jamais réaffichée). */
    apiKeyEnc: z.string().default(""),
    /** Adresse du serveur LibreTranslate (si ce service est choisi). */
    endpoint: z.union([z.literal(""), z.string().url()]).default(""),
  }).prefault({}),
  customers: z.object({
    /** Comptes clients (historique, adresses) proposés sur le site. */
    accountsEnabled: z.boolean().default(true),
  }).prefault({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/** Configuration effective (valeurs enregistrées + défauts), même si l'enregistrement est partiel ou ancien. */
export function parseConfig(raw: unknown): AppConfig {
  const r = ConfigSchema.safeParse(raw ?? {});
  return r.success ? r.data : ConfigSchema.parse({});
}

/** Texte lisible (blanc ou noir) sur une couleur de badge. */
export function badgeTextColor(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? "#0b0b0b" : "#ffffff";
}
