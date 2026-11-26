import { localDate, localHHMM, localWeekday } from "./time";

/** Règles pures des offres du moment (testables). */

export interface OfferRule {
  id: string;
  title: string;
  badge: string;
  description: string;
  productId: string | null;
  variantId: string | null;
  priceCents: number | null;
  imageId: string | null;
  weekdays: number[];
  startsAt: Date | null;
  endsAt: Date | null;
  timeFrom: string;
  timeTo: string;
  restaurantIds: string[];
  active: boolean;
  showOnHome: boolean;
  sortOrder: number;
}

export const WEEKDAY_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

/** L'offre s'applique-t-elle à ce moment, dans ce restaurant ? (jours, période, horaires — heure du restaurant) */
export function offerValidAt(o: OfferRule, at: Date, restaurantId: string, tz = "Europe/Paris"): boolean {
  if (!o.active) return false;
  if (o.restaurantIds.length && !o.restaurantIds.includes(restaurantId)) return false;
  if (o.startsAt && at < o.startsAt) return false;
  if (o.endsAt && at > o.endsAt) return false;
  if (o.weekdays.length && !o.weekdays.includes(localWeekday(localDate(at, tz)))) return false;
  const hm = localHHMM(at, tz);
  if (o.timeFrom && hm < o.timeFrom) return false;
  if (o.timeTo && hm > o.timeTo) return false;
  return true;
}

/** « Tous les mardis », « du 20/12 au 31/12 », « de 11:00 à 14:00 » : quand l'offre s'applique, en clair. */
export function offerWhen(o: Pick<OfferRule, "weekdays" | "startsAt" | "endsAt" | "timeFrom" | "timeTo">, tz = "Europe/Paris"): string {
  const parts: string[] = [];
  if (o.weekdays.length && o.weekdays.length < 7) {
    const days = [...o.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => `${WEEKDAY_LABELS[d]}s`);
    parts.push(days.length === 1 ? `Tous les ${days[0]}` : `Les ${days.slice(0, -1).join(", ")} et ${days.at(-1)}`);
  }
  const d = (x: Date) => localDate(x, tz).split("-").reverse().slice(0, 2).join("/");
  if (o.startsAt && o.endsAt) parts.push(`du ${d(o.startsAt)} au ${d(o.endsAt)}`);
  else if (o.endsAt) parts.push(`jusqu'au ${d(o.endsAt)}`);
  else if (o.startsAt) parts.push(`à partir du ${d(o.startsAt)}`);
  if (o.timeFrom && o.timeTo) parts.push(`de ${o.timeFrom.replace(":", "h")} à ${o.timeTo.replace(":", "h")}`);
  else if (o.timeFrom) parts.push(`dès ${o.timeFrom.replace(":", "h")}`);
  else if (o.timeTo) parts.push(`jusqu'à ${o.timeTo.replace(":", "h")}`);
  const s = parts.join(", ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Tous les jours";
}
