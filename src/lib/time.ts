import { TZDate } from "@date-fns/tz";

/** Fuseau par défaut des restaurants. Les calculs de créneaux se font toujours dans ce fuseau. */
export const PARIS = "Europe/Paris";

/** Date locale « AAAA-MM-JJ » d'un instant dans un fuseau. */
export function localDate(at: Date, tz = PARIS): string {
  const d = new TZDate(at.getTime(), tz);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Jour de la semaine local (0 = dimanche). */
export function localWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Instant UTC correspondant à « AAAA-MM-JJ » + « HH:MM » dans le fuseau (gère l'heure d'été). */
export function zonedTime(date: string, hhmm: string, tz = PARIS): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = hhmm.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, h, min, 0, tz).getTime());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function hhmmOf(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** « 12:30 » à partir d'un instant, dans le fuseau. */
export function localHHMM(at: Date, tz = PARIS): string {
  const d = new TZDate(at.getTime(), tz);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: PARIS });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: PARIS,
});

/** « samedi 18 octobre » (ou « Saturday, October 18 » selon la langue). */
export function formatDay(date: string, locale = "fr"): string {
  const fmt = locale === "fr" ? dayFmt : new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: PARIS });
  return fmt.format(zonedTime(date, "12:00"));
}

/** « 18/10/2026 12:30 » */
export function formatDateTime(at: Date): string {
  return dateTimeFmt.format(at);
}

/** « Aujourd'hui », « Demain » ou « samedi 18 octobre » (libellés traduits fournis par l'appelant). */
export function relativeDay(date: string, today: string, opts: { locale?: string; today?: string; tomorrow?: string } = {}): string {
  if (date === today) return opts.today ?? "Aujourd'hui";
  if (date === addDays(today, 1)) return opts.tomorrow ?? "Demain";
  const s = formatDay(date, opts.locale);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
