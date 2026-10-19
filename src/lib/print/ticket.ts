import { MODE_LABELS, PAYMENT_METHOD_LABELS } from "../catalog-constants";
import { euros } from "../money";
import type { FullOrder, OrderLineOption } from "../orders/load";
import { formatDay, localDate, localHHMM } from "../time";

/**
 * Modèle de ticket indépendant de l'imprimante. Chaque « rendu » (texte, Star Markup,
 * ESC/POS, Epson ePOS, HTML) part de cette même structure : le contenu est identique
 * quel que soit le matériel.
 */

export type TicketLine =
  | { kind: "title"; text: string } // très gros, centré
  | { kind: "big"; text: string } // gros, centré
  | { kind: "center"; text: string }
  | { kind: "text"; text: string; bold?: boolean }
  | { kind: "item"; qty: number; name: string; price: string; details: string[] }
  | { kind: "pair"; left: string; right: string; bold?: boolean }
  | { kind: "rule" }
  | { kind: "feed" };

export interface Ticket {
  lines: TicketLine[];
  copyLabel?: string;
}

export function buildTicket(o: FullOrder, copyLabel?: string): Ticket {
  const L: TicketLine[] = [];
  L.push({ kind: "center", text: o.restaurant.name.toUpperCase() });
  if (copyLabel) L.push({ kind: "center", text: `— ${copyLabel} —` });
  L.push({ kind: "title", text: `N° ${o.dailyNumber}` });
  L.push({ kind: "big", text: MODE_LABELS[o.mode].toUpperCase() });
  L.push({ kind: "big", text: `${localHHMM(o.slotStart)}` });
  L.push({ kind: "center", text: formatDay(localDate(o.slotStart)) });
  L.push({ kind: "rule" });
  L.push({ kind: "text", text: o.customerName, bold: true });
  L.push({ kind: "text", text: `Tél : ${o.customerPhone}`, bold: true });
  if (o.mode === "DELIVERY") {
    L.push({ kind: "text", text: o.addressStreet, bold: true });
    if (o.addressExtra) L.push({ kind: "text", text: o.addressExtra });
    L.push({ kind: "text", text: `${o.postalCode} ${o.city.toUpperCase()}`, bold: true });
    if (o.deliveryNotes) L.push({ kind: "text", text: `Livreur : ${o.deliveryNotes}` });
    if (o.zoneName) L.push({ kind: "text", text: o.zoneName });
  }
  L.push({ kind: "rule" });
  for (const l of o.lines) {
    const opts = (l.options as unknown as OrderLineOption[]).map((x) => `+ ${x.name}`);
    L.push({ kind: "item", qty: l.quantity, name: l.name, price: euros(l.totalCents), details: [...(l.variantLabel ? [l.variantLabel] : []), ...opts] });
  }
  if (o.notes) {
    L.push({ kind: "rule" });
    L.push({ kind: "text", text: `NOTE : ${o.notes}`, bold: true });
  }
  L.push({ kind: "rule" });
  if (o.extrasDiscountCents) L.push({ kind: "pair", left: "Petits plus offerts", right: `-${euros(o.extrasDiscountCents)}` });
  if (o.discountCents) L.push({ kind: "pair", left: `Remise ${o.promoCode}`.trim(), right: `-${euros(o.discountCents)}` });
  if (o.loyaltyDiscountCents) L.push({ kind: "pair", left: `Fidélité ${o.loyaltyRewardName}`.trim(), right: `-${euros(o.loyaltyDiscountCents)}` });
  if (o.mode === "DELIVERY") L.push({ kind: "pair", left: "Livraison", right: o.deliveryFeeCents ? euros(o.deliveryFeeCents) : "offerte" });
  L.push({ kind: "pair", left: "TOTAL TTC", right: euros(o.totalCents), bold: true });
  L.push({ kind: "text", text: PAYMENT_METHOD_LABELS[o.paymentMethod] });
  const paid = o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED";
  L.push({ kind: "big", text: paid ? "PAYÉ" : o.paymentStatus === "REFUNDED" ? "REMBOURSÉ" : "À ENCAISSER" });
  if (o.lines.some((l) => l.isAlcohol)) L.push({ kind: "center", text: "Contient de l'alcool : vérifier 18 ans" });
  L.push({ kind: "center", text: o.reference });
  L.push({ kind: "feed" });
  return { lines: L, copyLabel };
}

/** Largeur en caractères selon le papier (police A). */
export const COLUMNS = { MM58: 32, MM80: 48, A4: 80 } as const;

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > width) {
        if (line) out.push(line);
        line = word.length > width ? word.slice(0, width) : word;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out;
}

const center = (s: string, w: number) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;
const pair = (l: string, r: string, w: number) => {
  const left = l.slice(0, Math.max(1, w - r.length - 1));
  return left + " ".repeat(Math.max(1, w - left.length - r.length)) + r;
};

/** Rendu texte brut (monospace), utilisé aussi par ESC/POS et Star. */
export function renderText(t: Ticket, cols: number): string {
  const out: string[] = [];
  for (const l of t.lines) {
    switch (l.kind) {
      case "title":
      case "big":
      case "center":
        out.push(center(l.text, cols));
        break;
      case "text":
        out.push(...wrap(l.text, cols));
        break;
      case "item": {
        const head = wrap(`${l.qty} x ${l.name}`, cols - l.price.length - 1);
        out.push(pair(head[0]!, l.price, cols), ...head.slice(1).map((s) => `    ${s}`));
        for (const d of l.details) out.push(...wrap(d, cols - 4).map((s) => `    ${s}`));
        break;
      }
      case "pair":
        out.push(pair(l.left, l.right, cols));
        break;
      case "rule":
        out.push("-".repeat(cols));
        break;
      case "feed":
        out.push("", "");
        break;
    }
  }
  return out.join("\n");
}

/** Star Markup (CloudPRNT, type text/vnd.star.markup). */
export function renderStarMarkup(t: Ticket, cols: number): string {
  const out: string[] = ["[align: left][font: a]"];
  for (const l of t.lines) {
    switch (l.kind) {
      case "title":
        out.push(`[align: centre][mag: w 3; h 3][bold: on]${l.text}[bold: off][mag][align: left]`);
        break;
      case "big":
        out.push(`[align: centre][mag: w 2; h 2][bold: on]${l.text}[bold: off][mag][align: left]`);
        break;
      case "center":
        out.push(`[align: centre]${l.text}[align: left]`);
        break;
      case "text":
        out.push(l.bold ? `[bold: on]${l.text}[bold: off]` : l.text);
        break;
      case "item":
        out.push(`[bold: on][mag: w 1; h 2]${pair(`${l.qty} x ${l.name}`, l.price, cols)}[mag][bold: off]`);
        for (const d of l.details) out.push(`    ${d}`);
        break;
      case "pair":
        out.push(l.bold ? `[bold: on][mag: w 1; h 2]${pair(l.left, l.right, cols)}[mag][bold: off]` : pair(l.left, l.right, cols));
        break;
      case "rule":
        out.push("-".repeat(cols));
        break;
      case "feed":
        out.push("[feed: length 6mm]");
        break;
    }
  }
  out.push("[cut: feed; partial]");
  return out.join("\n");
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Epson ePOS-Print XML (Server Direct Print). */
export function renderEpsonXml(t: Ticket, cols: number): string {
  const x: string[] = [];
  const text = (s: string, o: { align?: string; w?: number; h?: number; em?: boolean } = {}) =>
    x.push(`<text align="${o.align ?? "left"}" width="${o.w ?? 1}" height="${o.h ?? 1}" em="${o.em ? "true" : "false"}">${xml(s)}&#10;</text>`);
  for (const l of t.lines) {
    switch (l.kind) {
      case "title":
        text(l.text, { align: "center", w: 3, h: 3, em: true });
        break;
      case "big":
        text(l.text, { align: "center", w: 2, h: 2, em: true });
        break;
      case "center":
        text(l.text, { align: "center" });
        break;
      case "text":
        text(l.text, { em: l.bold });
        break;
      case "item":
        text(pair(`${l.qty} x ${l.name}`, l.price, cols), { em: true, h: 2 });
        for (const d of l.details) text(`    ${d}`);
        break;
      case "pair":
        text(pair(l.left, l.right, cols), { em: l.bold, h: l.bold ? 2 : 1 });
        break;
      case "rule":
        text("-".repeat(cols));
        break;
      case "feed":
        x.push('<feed line="3"/>');
        break;
    }
  }
  x.push('<cut type="feed"/>');
  return `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text lang="fr"/>${x.join("")}</epos-print>`;
}
