import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import type { FullOrder } from "../orders/load";
import { buildTicket, type TicketLine } from "./ticket";

/**
 * Ticket en PDF (BizPrint et toute imprimante pilotée par un document) :
 * largeur 58 mm, 80 mm ou A4, une page par exemplaire (CUISINE / LIVREUR…).
 * Polices standard PDF (WinAnsi) : accents français et « € » pris en charge.
 */

export type PdfPaper = "MM58" | "MM80" | "A4";
const MM = 72 / 25.4;
const WIDTH: Record<PdfPaper, number> = { MM58: 58 * MM, MM80: 80 * MM, A4: 210 * MM };
const MARGIN: Record<PdfPaper, number> = { MM58: 2 * MM, MM80: 3 * MM, A4: 15 * MM };

/** Remplace les caractères absents de l'encodage WinAnsi (espaces fines, flèches…). */
function clean(s: string): string {
  return s.replace(/[  ]/g, " ").replace(/[→]/g, "->").replace(/[^\x20-\x7e -ÿ€œŒ’‘“”–—…•]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of clean(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

type Op = { text: string; size: number; bold: boolean; align: "left" | "center" | "right" | "pair"; right?: string; indent?: number } | { rule: true } | { gap: number };

export async function ticketPdf(order: FullOrder, paper: PdfPaper, copies: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Commande ${order.reference}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = WIDTH[paper];
  const margin = MARGIN[paper];
  const inner = width - 2 * margin;
  const base = paper === "MM58" ? 8.5 : 10;
  const labels = copies > 1 ? ["CUISINE", order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, Math.min(3, copies)) : [undefined];

  for (const label of labels) {
    const ops: Op[] = [];
    const push = (l: TicketLine) => {
      switch (l.kind) {
        case "title": ops.push({ text: l.text, size: base * 3, bold: true, align: "center" }); break;
        case "big": ops.push({ text: l.text, size: base * 1.9, bold: true, align: "center" }); break;
        case "center": ops.push({ text: l.text, size: base, bold: false, align: "center" }); break;
        case "text": ops.push({ text: l.text, size: base, bold: !!l.bold, align: "left" }); break;
        case "item":
          ops.push({ text: `${l.qty} x ${l.name}`, size: base * 1.15, bold: true, align: "pair", right: l.price });
          for (const d of l.details) ops.push({ text: d, size: base * 0.95, bold: false, align: "left", indent: 4 * MM });
          break;
        case "pair": ops.push({ text: l.left, size: l.bold ? base * 1.3 : base, bold: !!l.bold, align: "pair", right: l.right }); break;
        case "rule": ops.push({ rule: true }); break;
        case "feed": ops.push({ gap: 4 * MM }); break;
      }
    };
    buildTicket(order, label).lines.forEach(push);

    // Hauteur exacte du contenu (ticket thermique : page aussi longue que nécessaire).
    const layout: { op: Op; lines: string[] }[] = ops.map((op) => {
      if ("rule" in op || "gap" in op) return { op, lines: [] };
      const font = op.bold ? bold : regular;
      const avail = inner - (op.indent ?? 0) - (op.align === "pair" ? font.widthOfTextAtSize(clean(op.right ?? ""), op.size) + 2 * MM : 0);
      return { op, lines: wrap(op.text, font, op.size, avail) };
    });
    const heightOf = (x: { op: Op; lines: string[] }) => ("rule" in x.op ? 3 * MM : "gap" in x.op ? x.op.gap : x.lines.length * x.op.size * 1.25);
    const contentHeight = layout.reduce((s, x) => s + heightOf(x), 0);
    const pageHeight = paper === "A4" ? 297 * MM : contentHeight + 2 * margin;
    const page = pdf.addPage([width, pageHeight]);
    let y = pageHeight - margin;

    for (const x of layout) {
      if ("rule" in x.op) {
        y -= 1.5 * MM;
        page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, dashArray: [2, 2] });
        y -= 1.5 * MM;
        continue;
      }
      if ("gap" in x.op) {
        y -= x.op.gap;
        continue;
      }
      const op = x.op;
      const font = op.bold ? bold : regular;
      x.lines.forEach((text, i) => {
        y -= op.size * 1.25;
        const w = font.widthOfTextAtSize(text, op.size);
        const xPos = op.align === "center" ? (width - w) / 2 : margin + (op.indent ?? 0);
        page.drawText(text, { x: xPos, y: y + op.size * 0.25, size: op.size, font });
        if (op.align === "pair" && i === 0 && op.right) {
          const r = clean(op.right);
          page.drawText(r, { x: width - margin - font.widthOfTextAtSize(r, op.size), y: y + op.size * 0.25, size: op.size, font });
        }
      });
    }
  }
  return pdf.save();
}
