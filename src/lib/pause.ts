/**
 * Fermeture des commandes en ligne d'un restaurant (pause) : pendant la pause, aucun créneau
 * n'est proposé, quel que soit le jour (aujourd'hui comme les jours suivants).
 * « Jusqu'à nouvel ordre » est enregistré comme une date très lointaine.
 */

export const INDEFINITE = new Date("2999-12-31T00:00:00Z");
export const isIndefinite = (until: Date) => until.getUTCFullYear() >= 2999;

type Translate = (key: "pause.untilFurther" | "pause.untilTime" | "pause.untilDay" | "pause.untilDateTime", vars?: Record<string, string>) => string;

/**
 * « jusqu'à nouvel ordre », « jusqu'à 14:30 », « jusqu'au dimanche 20 octobre inclus »,
 * « jusqu'au lundi 21 octobre à 11:00 ».
 */
export function pauseUntilText(until: Date, t: Translate, locale = "fr", tz = "Europe/Paris", now = new Date()): string {
  if (isIndefinite(until)) return t("pause.untilFurther");
  const day = (d: Date) => new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(until);
  // Fin à minuit (contrôle en heure sur 24 h, quel que soit l'affichage local) : la veille est entièrement fermée.
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(until);
  if (hm === "00:00") return t("pause.untilDay", { date: day(new Date(until.getTime() - 60_000)) });
  if (ymd(until) === ymd(now)) return t("pause.untilTime", { time });
  return t("pause.untilDateTime", { date: day(until), time });
}
