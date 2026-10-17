/** Montants en centimes (entiers) : jamais de flottants pour l'argent. */

/**
 * Devise et format des prix : réglés une fois pour tout le site (Configuration → Région).
 * La même valeur vaut pour toutes les requêtes : un état global au module suffit.
 */
let fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
let current = "EUR|fr-FR";

/** Langue courte (« fr ») ou complète (« fr-FR ») acceptées. */
export function setMoneyFormat(currency: string, locale: string): void {
  const key = `${currency}|${locale}`;
  if (key === current) return;
  try {
    fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
    current = key;
  } catch {
    /* devise ou langue inconnue : on garde le format précédent */
  }
}

export function currentCurrency(): string {
  return current.split("|")[0]!;
}

/** 1290 → « 12,90 € » (ou « $12.90 », « 12,90 CHF »… selon la Configuration). */
export function money(cents: number): string {
  return fmt.format(cents / 100).replace(/ /g, " ");
}

/** Ancien nom, conservé : formate dans la devise configurée (pas forcément l'euro). */
export const euros = money;

/** « 12,90 » ou « 12.9 » → 1290 ; null si invalide. */
export function parseEuros(input: string): number | null {
  // Accepte « 12,90 », « 12.90 », « 12,90 € », « $12.90 », « 12.90 CHF ».
  const s = input.trim().replace(/[^\d,.]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Taux en points de base : 1000 → « 10 % », 550 → « 5,5 % » */
export function vatLabel(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString("fr-FR")} %`;
}

/** Part de TVA contenue dans un montant TTC. */
export function vatFromTtc(ttcCents: number, rateBp: number): number {
  return Math.round((ttcCents * rateBp) / (10000 + rateBp));
}

export interface VatLine {
  rate: number;
  baseCents: number; // HT
  vatCents: number;
  totalCents: number; // TTC
}

/** Ventile des montants TTC par taux (HT / TVA / TTC). */
export function vatBreakdown(amounts: { rate: number; ttcCents: number }[]): VatLine[] {
  const byRate = new Map<number, number>();
  for (const a of amounts) byRate.set(a.rate, (byRate.get(a.rate) ?? 0) + a.ttcCents);
  return [...byRate.entries()]
    .filter(([, ttc]) => ttc !== 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, ttc]) => {
      const vat = vatFromTtc(ttc, rate);
      return { rate, baseCents: ttc - vat, vatCents: vat, totalCents: ttc };
    });
}

/**
 * Répartit `amount` au prorata des `weights` (méthode du plus fort reste) :
 * la somme des parts vaut exactement `amount`.
 */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || amount === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const parts = raw.map((r) => Math.floor(r));
  let rest = amount - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k]!.i]! += 1;
  return parts;
}
