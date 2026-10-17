import type { FullOrder } from "../orders/load";
import { buildTicket, type TicketLine } from "./ticket";

/** Rendu HTML du ticket pour l'impression navigateur (58 mm, 80 mm, A4). */

export type Paper = "58" | "80" | "A4";
const WIDTH: Record<Paper, string> = { "58": "58mm", "80": "80mm", A4: "190mm" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function line(l: TicketLine): string {
  switch (l.kind) {
    case "title":
      return `<p class="t-title">${esc(l.text)}</p>`;
    case "big":
      return `<p class="t-big">${esc(l.text)}</p>`;
    case "center":
      return `<p class="t-center">${esc(l.text)}</p>`;
    case "text":
      return `<p${l.bold ? ' class="b"' : ""}>${esc(l.text)}</p>`;
    case "item":
      return `<div class="t-item"><p class="t-row"><strong>${l.qty} × ${esc(l.name)}</strong><span>${esc(l.price)}</span></p>${l.details.map((d) => `<p class="t-detail">${esc(d)}</p>`).join("")}</div>`;
    case "pair":
      return `<p class="t-row${l.bold ? " t-total" : ""}"><span>${esc(l.left)}</span><span>${esc(l.right)}</span></p>`;
    case "rule":
      return "<hr>";
    case "feed":
      return '<div style="height:6mm"></div>';
  }
}

export function ticketHtml(order: FullOrder, opts: { paper: Paper; copies: number; auto: boolean }): string {
  const copies = Math.min(3, Math.max(1, opts.copies));
  const labels = copies === 1 ? [undefined] : ["CUISINE", order.mode === "DELIVERY" ? "LIVREUR" : "COMPTOIR", "CLIENT"].slice(0, copies);
  const tickets = labels.map((label) => `<div class="ticket">${buildTicket(order, label).lines.map(line).join("")}</div>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ticket ${esc(order.reference)}</title><style>
@page { size: ${opts.paper === "A4" ? "A4" : `${WIDTH[opts.paper]} auto`}; margin: ${opts.paper === "A4" ? "10mm" : "2mm"}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.ticket { width: ${WIDTH[opts.paper]}; padding: 2mm; font-size: ${opts.paper === "58" ? "11px" : "13px"}; line-height: 1.3; page-break-after: always; }
.ticket:last-of-type { page-break-after: auto; }
p { margin: 0 0 1mm; } .b { font-weight: 700; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
.t-title { font-size: 3em; font-weight: 900; text-align: center; line-height: 1; }
.t-big { font-size: 1.9em; font-weight: 800; text-align: center; line-height: 1.1; }
.t-center { text-align: center; }
.t-row { display: flex; justify-content: space-between; gap: 2mm; }
.t-total { font-weight: 800; font-size: 1.25em; }
.t-item { margin-bottom: 1.5mm; font-size: 1.1em; }
.t-detail { padding-left: 4mm; font-size: .9em; }
.bar { text-align: center; padding: 10px; } .bar button { font-size: 18px; padding: 10px 24px; }
@media screen { body { background: #ddd; padding: 10px; } .ticket { background: #fff; margin: 0 auto 10px; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
@media print { .bar { display: none; } }
</style></head><body>
${opts.auto ? "" : '<div class="bar"><button onclick="window.print()">Imprimer</button></div>'}
${tickets}
${opts.auto ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})</script>" : ""}
</body></html>`;
}
