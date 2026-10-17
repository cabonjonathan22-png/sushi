import { addDays, hhmmOf, localDate, localWeekday, minutesOf, zonedTime } from "./time";

/**
 * Créneaux de retrait / livraison.
 * Une plage d'ouverture (ex. 10:00-14:00, midi) est découpée en créneaux de
 * `slotMinutes`. Un créneau est proposé si :
 *  - le restaurant n'est ni en pause (« fermer les commandes maintenant ») ni fermé ce jour-là ;
 *  - il commence au moins `prepMinutes` après l'ouverture de la plage ;
 *  - il laisse le temps de préparer (et de livrer) depuis maintenant ;
 *  - il n'est pas complet (`maxOrdersPerSlot`).
 * Tous les calculs se font dans le fuseau du restaurant (heure d'été comprise).
 */

export type Period = "LUNCH" | "DINNER";

export interface OpeningRange {
  weekday: number; // 0 = dimanche
  opens: string; // HH:MM
  closes: string;
  period: Period;
}

export interface Closure {
  startDate: string; // AAAA-MM-JJ inclus
  endDate: string;
}

export interface SlotSettings {
  prepMinutes: number;
  slotMinutes: number;
  maxOrdersPerSlot: number | null;
  maxDaysAhead: number;
  ordersPausedUntil: Date | null;
  timezone: string;
}

export interface Slot {
  start: Date;
  end: Date;
  /** « 12:15 » */
  label: string;
  period: Period;
  full: boolean;
}

export interface SlotDay {
  date: string;
  slots: Slot[];
}

export interface SlotQuery {
  now: Date;
  settings: SlotSettings;
  hours: OpeningRange[];
  closures: Closure[];
  /** Délai supplémentaire (ex. temps de livraison de la zone), en minutes. */
  extraMinutes?: number;
  /** Nombre de commandes déjà prises par début de créneau (clé : ISO). */
  taken?: Map<string, number>;
}

export function isPaused(settings: Pick<SlotSettings, "ordersPausedUntil">, now: Date): boolean {
  return !!settings.ordersPausedUntil && settings.ordersPausedUntil.getTime() > now.getTime();
}

export function isClosedOn(date: string, closures: Closure[]): boolean {
  return closures.some((c) => c.startDate <= date && date <= c.endDate);
}

export function computeSlots(q: SlotQuery): SlotDay[] {
  const { now, settings, hours, closures } = q;
  if (isPaused(settings, now)) return [];
  const tz = settings.timezone;
  const step = Math.max(5, settings.slotMinutes);
  const earliest = now.getTime() + (settings.prepMinutes + (q.extraMinutes ?? 0)) * 60_000;
  const today = localDate(now, tz);
  const days: SlotDay[] = [];

  for (let i = 0; i <= settings.maxDaysAhead; i++) {
    const date = addDays(today, i);
    if (isClosedOn(date, closures)) continue;
    const weekday = localWeekday(date);
    const ranges = hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => minutesOf(a.opens) - minutesOf(b.opens));
    const slots: Slot[] = [];
    for (const r of ranges) {
      const first = minutesOf(r.opens) + settings.prepMinutes;
      const last = minutesOf(r.closes) - step;
      // Premier créneau aligné sur la grille à partir de l'ouverture.
      const firstAligned = minutesOf(r.opens) + Math.ceil((first - minutesOf(r.opens)) / step) * step;
      for (let m = firstAligned; m <= last; m += step) {
        const start = zonedTime(date, hhmmOf(m), tz);
        if (start.getTime() < earliest) continue;
        const end = new Date(start.getTime() + step * 60_000);
        const count = q.taken?.get(start.toISOString()) ?? 0;
        const full = settings.maxOrdersPerSlot !== null && count >= settings.maxOrdersPerSlot;
        slots.push({ start, end, label: hhmmOf(m), period: r.period, full });
      }
    }
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** Retrouve un créneau proposé (et non complet) à partir de son début ISO. */
export function findAvailableSlot(days: SlotDay[], startIso: string): Slot | null {
  for (const d of days) for (const s of d.slots) if (s.start.toISOString() === startIso && !s.full) return s;
  return null;
}

/** Ouvert en ce moment (pour l'affichage « Ouvert / Fermé »). */
export function isOpenAt(now: Date, hours: OpeningRange[], closures: Closure[], tz: string): boolean {
  const date = localDate(now, tz);
  if (isClosedOn(date, closures)) return false;
  const wd = localWeekday(date);
  return hours.some((h) => {
    if (h.weekday !== wd) return false;
    const t = now.getTime();
    return zonedTime(date, h.opens, tz).getTime() <= t && t < zonedTime(date, h.closes, tz).getTime();
  });
}
