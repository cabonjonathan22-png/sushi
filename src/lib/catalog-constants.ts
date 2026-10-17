/** Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011, annexe II). */
export const ALLERGENS = [
  { code: "GLUTEN", label: "Gluten" },
  { code: "CRUSTACEANS", label: "Crustacés" },
  { code: "EGGS", label: "Œufs" },
  { code: "FISH", label: "Poisson" },
  { code: "PEANUTS", label: "Arachides" },
  { code: "SOY", label: "Soja" },
  { code: "MILK", label: "Lait" },
  { code: "NUTS", label: "Fruits à coque" },
  { code: "CELERY", label: "Céleri" },
  { code: "MUSTARD", label: "Moutarde" },
  { code: "SESAME", label: "Sésame" },
  { code: "SULPHITES", label: "Sulfites" },
  { code: "LUPIN", label: "Lupin" },
  { code: "MOLLUSCS", label: "Mollusques" },
] as const;

/** Produit vérifié ne contenant aucun des 14 allergènes (distinct de « non renseigné »). */
export const NO_ALLERGEN = "NONE";
/** Vrai si l'information allergènes a été renseignée (allergènes listés ou « aucun »). */
export const allergensDeclared = (a: string[]) => a.length > 0;
/** Liste des allergènes réels (sans le marqueur « aucun »). */
export const allergenCodes = (a: string[]) => a.filter((x) => x !== NO_ALLERGEN);

export type AllergenCode = (typeof ALLERGENS)[number]["code"];
export const allergenLabel = (code: string) => ALLERGENS.find((a) => a.code === code)?.label ?? code;

/* Badges et taux de TVA : réglables dans la Configuration (src/lib/config-schema.ts). */

export const ALCOHOL_NOTICE = "L'abus d'alcool est dangereux pour la santé, à consommer avec modération.";
export const ALCOHOL_MINORS = "La vente d'alcool est interdite aux mineurs de moins de 18 ans.";

export const PAYMENT_METHOD_LABELS = {
  ONLINE_CARD: "Carte bancaire en ligne",
  CASH: "Espèces",
  CARD_TERMINAL: "Carte bancaire (TPE)",
  MEAL_VOUCHER_PAPER: "Titres-restaurant papier",
  MEAL_VOUCHER_CARD: "Titres-restaurant carte",
} as const;

export const MODE_LABELS = { PICKUP: "Retrait", DELIVERY: "Livraison", DINE_IN: "Sur place" } as const;

export const STATUS_LABELS = {
  PENDING_PAYMENT: "Paiement en attente",
  NEW: "Nouvelle",
  ACCEPTED: "Acceptée",
  PREPARING: "En préparation",
  READY: "Prête",
  OUT_FOR_DELIVERY: "En livraison",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
} as const;

export const PAYMENT_STATUS_LABELS = {
  UNPAID: "À encaisser",
  PENDING: "Paiement en cours",
  PAID: "Payé",
  PARTIALLY_REFUNDED: "Remboursé en partie",
  REFUNDED: "Remboursé",
  FAILED: "Paiement échoué",
} as const;

export const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;
/** Ordre d'affichage : lundi → dimanche. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
