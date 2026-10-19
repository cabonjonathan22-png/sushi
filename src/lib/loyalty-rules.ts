/**
 * Règles de la carte de fidélité (sans accès à la base : utilisables côté client et testées).
 * Les points se gagnent sur le montant payé hors frais de livraison, une fois la commande remise.
 */

export type RewardType = "AMOUNT" | "PERCENT" | "FREE_PRODUCT";

export interface RewardRule {
  id: string;
  name: string;
  type: RewardType;
  /** AMOUNT : centimes ; PERCENT : 1 à 100 ; FREE_PRODUCT : inutilisé. */
  value: number;
  productId: string | null;
  pointsCost: number;
  minSubtotalCents: number;
  active: boolean;
}

export type RewardProblem = "INACTIVE" | "NOT_ENOUGH_POINTS" | "MINIMUM" | "PRODUCT_UNAVAILABLE" | "LOGIN_REQUIRED";

/** Points gagnés pour un montant payé (centimes), arrondis à l'inférieur. */
export function pointsFor(amountCents: number, pointsPerEuro: number): number {
  return Math.max(0, Math.floor((amountCents * pointsPerEuro) / 100));
}

/** Pourquoi une récompense ne peut pas être utilisée (null = utilisable). */
export function rewardProblem(r: RewardRule, balance: number, subtotalCents: number): RewardProblem | null {
  if (!r.active) return "INACTIVE";
  if (balance < r.pointsCost) return "NOT_ENOUGH_POINTS";
  if (subtotalCents < r.minSubtotalCents) return "MINIMUM";
  return null;
}

/** Montant de la remise d'une récompense, plafonné à ce qui reste à payer. */
export function rewardDiscount(r: RewardRule, remainingCents: number, freeProductUnitCents = 0): number {
  const raw = r.type === "AMOUNT" ? r.value : r.type === "PERCENT" ? Math.round((remainingCents * Math.min(100, Math.max(0, r.value))) / 100) : freeProductUnitCents;
  return Math.max(0, Math.min(raw, remainingCents));
}

/** Prochaine récompense à atteindre (la moins chère que le solde ne couvre pas encore). */
export function nextReward<T extends { pointsCost: number; active: boolean }>(rewards: T[], balance: number): T | null {
  return rewards.filter((r) => r.active && r.pointsCost > balance).sort((a, b) => a.pointsCost - b.pointsCost)[0] ?? null;
}
