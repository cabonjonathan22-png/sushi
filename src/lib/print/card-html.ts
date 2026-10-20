import "server-only";
import { cardQrSvg, formatCardNumber } from "../loyalty-card";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Carte de fidélité imprimable :
 *  - « carte » : format carte bancaire (85,6 × 54 mm) sur une feuille A4, avec traits de coupe ;
 *  - « ticket » : sur l'imprimante de tickets 80 mm du restaurant (à remettre au client).
 */
export async function cardHtml(o: { brand: string; name: string; number: string; format: "carte" | "ticket"; auto?: boolean; hint: string }): Promise<string> {
  const qr = await cardQrSvg(o.number);
  const num = formatCardNumber(o.number);
  const card = `
    <div class="card">
      <div class="left">
        <p class="brand">${esc(o.brand)}</p>
        <p class="kind">Carte de fidélité</p>
        <p class="name">${esc(o.name)}</p>
        <p class="num">${num}</p>
      </div>
      <div class="qr">${qr}</div>
    </div>`;
  const ticket = `
    <div class="ticket">
      <p class="brand">${esc(o.brand)}</p>
      <p class="kind">CARTE DE FIDÉLITÉ</p>
      <div class="qr">${qr}</div>
      <p class="name">${esc(o.name)}</p>
      <p class="num">${num}</p>
      <p class="hint">${esc(o.hint)}</p>
    </div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carte de fidélité – ${esc(o.name)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f1a17;background:#f4efe8}
  .bar{display:flex;gap:8px;justify-content:center;padding:16px} .bar button,.bar a{font:inherit;font-weight:600;padding:10px 18px;border-radius:999px;border:1px solid #1f1a17;background:#fff;color:#1f1a17;text-decoration:none;cursor:pointer}
  .bar button{background:#1f1a17;color:#fff}
  .sheet{display:flex;justify-content:center;padding:24px}
  .card{width:85.6mm;height:54mm;border-radius:3.2mm;background:#1f1a17;color:#fbf7f1;display:flex;align-items:center;gap:3mm;padding:4mm 4mm 4mm 5mm;outline:1px dashed #999;outline-offset:2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .card .left{flex:1;min-width:0;display:flex;flex-direction:column;height:100%}
  .card .brand{margin:0;font:600 5mm/1.1 Georgia,"Times New Roman",serif}
  .card .kind{margin:1mm 0 0;font-size:2.6mm;letter-spacing:.3mm;text-transform:uppercase;color:#d8b26e}
  .card .name{margin:auto 0 0;font-size:3.4mm;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .card .num{margin:1mm 0 0;font:600 3.2mm/1 ui-monospace,Consolas,monospace;letter-spacing:.2mm}
  .card .qr{width:30mm;height:30mm;background:#fff;border-radius:2mm;padding:1mm;flex-shrink:0} .qr svg{display:block;width:100%;height:100%}
  .ticket{width:72mm;background:#fff;padding:4mm;text-align:center}
  .ticket .brand{margin:0;font:700 6mm/1.1 Georgia,serif} .ticket .kind{margin:1mm 0 3mm;font-weight:700;font-size:3.5mm}
  .ticket .qr{width:50mm;height:50mm;margin:0 auto} .ticket .name{font-size:4.5mm;font-weight:700;margin:3mm 0 1mm} .ticket .num{font:700 4.5mm ui-monospace,Consolas,monospace;margin:0}
  .ticket .hint{font-size:3.2mm;margin:3mm 0 0}
  @media print{ body{background:#fff} .bar{display:none} .sheet{padding:0;justify-content:flex-start} }
  @page{ ${o.format === "ticket" ? "size:80mm auto;margin:0" : "size:A4;margin:12mm"} }
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimer</button>
<a href="?format=${o.format === "ticket" ? "carte" : "ticket"}">${o.format === "ticket" ? "Format carte (feuille A4)" : "Format ticket (imprimante 80 mm)"}</a></div>
<div class="sheet">${o.format === "ticket" ? ticket : card}</div>
${o.auto ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))</script>" : ""}
</body></html>`;
}
