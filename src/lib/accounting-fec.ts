import type { VatLine } from "./money";
import { localDate } from "./time";

/**
 * Écritures comptables du journal des ventes, au format FEC (Fichier des Écritures
 * Comptables, article A47 A-1 du LPF) : importable dans les logiciels des experts-comptables.
 *
 * Une écriture par jour de service :
 *   débit  : comptes de trésorerie / attente, un par moyen de paiement (TTC encaissé) ;
 *   crédit : ventes HT et TVA collectée, un compte par taux.
 * Un avoir (remboursement) passe l'écriture inverse, à sa date, ventilée au prorata des taux.
 * Les écarts d'arrondi éventuels sont soldés sur les comptes d'arrondi : chaque écriture est équilibrée.
 */

export interface AccountingAccounts {
  journalCode: string;
  journalLabel: string;
  /** Taux en points de base (1000 = 10 %) → compte de ventes / compte de TVA collectée. */
  sales: Record<string, string>;
  vat: Record<string, string>;
  /** Moyen de paiement (CASH, ONLINE_CARD…) → compte de trésorerie ou d'attente. */
  payment: Record<string, string>;
  defaultSales: string;
  defaultVat: string;
  defaultPayment: string;
  roundingDebit: string;
  roundingCredit: string;
}

export interface FecSale {
  slotStart: Date;
  reference: string;
  paymentMethod: string;
  totalCents: number;
  vatBreakdown: VatLine[];
}

export interface FecRefund {
  createdAt: Date;
  creditNumber: string;
  amountCents: number;
  order: { reference: string; paymentMethod: string; totalCents: number; vatBreakdown: VatLine[] };
}

export interface FecLine {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: string; // AAAAMMJJ
  compteNum: string;
  compteLib: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debit: number; // centimes
  credit: number;
}

export const FEC_HEADER = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib",
  "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
];

const rateLabel = (rate: number) => `${(rate / 100).toLocaleString("fr-FR")} %`;
const ymd = (date: string) => date.replace(/-/g, "");
const fr = (date: string) => date.split("-").reverse().join("/");

/** Répartit un montant entre plusieurs parts au prorata, au centime près (somme exacte). */
export function prorate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map((_, i) => (i === 0 ? amount : 0));
  const raw = weights.map((w) => (amount * w) / total);
  const out = raw.map(Math.floor);
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i]! += 1;
    rest -= 1;
  }
  return out;
}

export function buildFecLines(sales: FecSale[], refunds: FecRefund[], acc: AccountingAccounts, paymentLabels: Record<string, string>, tz = "Europe/Paris"): FecLine[] {
  const lines: FecLine[] = [];
  const salesAcc = (rate: number) => acc.sales[String(rate)] || acc.defaultSales;
  const vatAcc = (rate: number) => acc.vat[String(rate)] || acc.defaultVat;
  const payAcc = (m: string) => acc.payment[m] || acc.defaultPayment;
  const base = { journalCode: acc.journalCode, journalLib: acc.journalLabel };

  // Ventes, regroupées par jour de service.
  const byDay = new Map<string, FecSale[]>();
  for (const s of sales) {
    const d = localDate(s.slotStart, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  for (const day of [...byDay.keys()].sort()) {
    const list = byDay.get(day)!;
    const num = `${acc.journalCode}${ymd(day)}`;
    const lib = `Ventes du ${fr(day)}`;
    const common = { ...base, ecritureNum: num, ecritureDate: ymd(day), pieceRef: num, pieceDate: ymd(day), ecritureLib: lib };
    const pay = new Map<string, number>();
    const ht = new Map<number, number>();
    const tva = new Map<number, number>();
    for (const s of list) {
      pay.set(s.paymentMethod, (pay.get(s.paymentMethod) ?? 0) + s.totalCents);
      for (const v of s.vatBreakdown) {
        ht.set(v.rate, (ht.get(v.rate) ?? 0) + v.baseCents);
        tva.set(v.rate, (tva.get(v.rate) ?? 0) + v.vatCents);
      }
    }
    for (const [m, c] of [...pay].sort()) lines.push({ ...common, compteNum: payAcc(m), compteLib: `Encaissements ${paymentLabels[m] ?? m}`, debit: c, credit: 0 });
    for (const [r, c] of [...ht].sort((a, b) => a[0] - b[0])) lines.push({ ...common, compteNum: salesAcc(r), compteLib: `Ventes TVA ${rateLabel(r)}`, debit: 0, credit: c });
    for (const [r, c] of [...tva].sort((a, b) => a[0] - b[0])) if (c) lines.push({ ...common, compteNum: vatAcc(r), compteLib: `TVA collectée ${rateLabel(r)}`, debit: 0, credit: c });
    balance(lines, num, common, acc);
  }

  // Avoirs : écriture inverse, ventilée au prorata de la TVA de la commande.
  for (const r of [...refunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const day = localDate(r.createdAt, tz);
    const num = `AV${ymd(day)}-${r.creditNumber}`;
    const common = { ...base, ecritureNum: num, ecritureDate: ymd(day), pieceRef: r.creditNumber, pieceDate: ymd(day), ecritureLib: `Avoir ${r.creditNumber} (commande ${r.order.reference})` };
    const vat = r.order.vatBreakdown;
    const parts = prorate(r.amountCents, vat.map((v) => v.totalCents));
    vat.forEach((v, i) => {
      const ttc = parts[i]!;
      if (!ttc) return;
      const tvaPart = v.totalCents ? Math.round((ttc * v.vatCents) / v.totalCents) : 0;
      lines.push({ ...common, compteNum: salesAcc(v.rate), compteLib: `Ventes TVA ${rateLabel(v.rate)}`, debit: ttc - tvaPart, credit: 0 });
      if (tvaPart) lines.push({ ...common, compteNum: vatAcc(v.rate), compteLib: `TVA collectée ${rateLabel(v.rate)}`, debit: tvaPart, credit: 0 });
    });
    lines.push({ ...common, compteNum: payAcc(r.order.paymentMethod), compteLib: `Remboursement ${paymentLabels[r.order.paymentMethod] ?? r.order.paymentMethod}`, debit: 0, credit: r.amountCents });
    balance(lines, num, common, acc);
  }
  return lines;
}

/** Solde un éventuel écart d'arrondi de l'écriture `num` sur les comptes d'arrondi. */
function balance(lines: FecLine[], num: string, common: Omit<FecLine, "compteNum" | "compteLib" | "debit" | "credit">, acc: AccountingAccounts) {
  const own = lines.filter((l) => l.ecritureNum === num);
  const diff = own.reduce((a, l) => a + l.debit - l.credit, 0);
  if (diff > 0) lines.push({ ...common, compteNum: acc.roundingCredit, compteLib: "Écarts d'arrondi", debit: 0, credit: diff });
  if (diff < 0) lines.push({ ...common, compteNum: acc.roundingDebit, compteLib: "Écarts d'arrondi", debit: -diff, credit: 0 });
}

const amount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Fichier texte FEC : tabulations, montants à virgule, dates AAAAMMJJ, fins de ligne CRLF. */
export function fecText(lines: FecLine[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const rows = lines.map((l) => [
    l.journalCode, l.journalLib, l.ecritureNum, l.ecritureDate, l.compteNum, clean(l.compteLib), "", "",
    l.pieceRef, l.pieceDate, clean(l.ecritureLib), amount(l.debit), amount(l.credit), "", "", l.ecritureDate, "", "",
  ].join("\t"));
  return [FEC_HEADER.join("\t"), ...rows].join("\r\n") + "\r\n";
}
