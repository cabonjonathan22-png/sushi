/**
 * Zones de livraison : une zone = liste de couples (code postal, commune).
 * La commune est comparée de façon tolérante (accents, tirets, « St »/« Saint »),
 * ce qui permet de distinguer deux communes partageant un code postal (84160).
 */

export interface ZoneArea {
  postalCode: string;
  city: string;
}

export interface ZoneRule {
  id: string;
  name: string;
  active: boolean;
  minLunchCents: number;
  minDinnerCents: number;
  feeCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  areas: ZoneArea[];
}

export type Period = "LUNCH" | "DINNER";

/** « Saint-Martin-de-la-Brasque » ≡ « st martin de la brasque » */
export function cityKey(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/\bste?\b/g, (m) => (m === "st" ? "saint" : "sainte"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePostalCode(cp: string): string {
  return cp.replace(/\s/g, "");
}

/** Zone active desservant ce couple code postal + commune, ou null. */
export function findZone<Z extends ZoneRule>(zones: Z[], postalCode: string, city: string): Z | null {
  const cp = normalizePostalCode(postalCode);
  const key = cityKey(city);
  return (
    zones.find((z) => z.active && z.areas.some((a) => normalizePostalCode(a.postalCode) === cp && cityKey(a.city) === key)) ??
    null
  );
}

/** Communes desservies pour un code postal (pour proposer la liste au client). */
export function citiesForPostalCode(zones: ZoneRule[], postalCode: string): string[] {
  const cp = normalizePostalCode(postalCode);
  return [...new Set(zones.filter((z) => z.active).flatMap((z) => z.areas.filter((a) => a.postalCode === cp).map((a) => a.city)))].sort(
    (a, b) => a.localeCompare(b, "fr"),
  );
}

export function minimumFor(zone: Pick<ZoneRule, "minLunchCents" | "minDinnerCents">, period: Period): number {
  return period === "LUNCH" ? zone.minLunchCents : zone.minDinnerCents;
}

/** Frais de livraison selon le sous-total (gratuit au-delà du seuil). */
export function deliveryFee(zone: Pick<ZoneRule, "feeCents" | "freeFromCents">, subtotalCents: number): number {
  if (zone.freeFromCents !== null && subtotalCents >= zone.freeFromCents) return 0;
  return zone.feeCents;
}

/** Montant manquant pour atteindre le minimum (0 si atteint). */
export function missingForMinimum(subtotalCents: number, minimumCents: number): number {
  return Math.max(0, minimumCents - subtotalCents);
}
