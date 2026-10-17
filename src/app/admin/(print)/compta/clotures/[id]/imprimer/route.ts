import { getStaff } from "@/lib/auth/session";
import { MODE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/catalog-constants";
import { db } from "@/lib/db";
import { euros, vatLabel } from "@/lib/money";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";

type Totals = {
  orders: number; ttc: number; ht: number; vat: number; refunds: number; net: number;
  byVat: { rate: number; ht: number; vat: number; ttc: number }[];
  byMode: Record<string, { orders: number; ttc: number }>;
  byPayment: Record<string, { orders: number; ttc: number; paid: number }>;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Récapitulatif de clôture imprimable (A4 ou ticket 80 mm). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return new Response("Non autorisé", { status: 401 });
  const c = await db.dailyClosure.findUnique({ where: { id: (await params).id }, include: { restaurant: true } });
  if (!c || !can(staff.actor, "accounting.view", c.restaurantId)) return new Response("Introuvable", { status: 404 });
  const t = c.totals as unknown as Totals;
  const closer = c.closedById ? await db.user.findUnique({ where: { id: c.closedById }, select: { name: true } }) : null;
  const row = (l: string, v: string) => `<tr><td>${esc(l)}</td><td class="r">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Clôture ${c.date}</title><style>
body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#000}h1{margin:0}table{width:100%;border-collapse:collapse;margin:8px 0 16px}
td,th{padding:4px 0;border-bottom:1px dotted #999;text-align:left}.r{text-align:right}.big td{font-size:1.3em;font-weight:bold}small{color:#555;word-break:break-all}
@media print{button{display:none}}</style></head><body>
<button onclick="window.print()" style="font-size:16px;padding:8px 18px;margin-bottom:12px">Imprimer</button>
<h1>Clôture journalière</h1><p><strong>${esc(c.restaurant.name)}</strong> — ${esc(c.restaurant.street)}, ${esc(c.restaurant.postalCode)} ${esc(c.restaurant.city)}<br>
Journée de service du <strong>${c.date.split("-").reverse().join("/")}</strong> · clôturée le ${formatDateTime(c.closedAt)}${closer ? ` par ${esc(closer.name)}` : ""}</p>
<table>${row("Commandes", String(t.orders))}${row("Total HT", euros(t.ht))}${row("Total TVA", euros(t.vat))}</table>
<table class="big">${row("Chiffre d'affaires TTC", euros(t.ttc))}</table>
${t.refunds ? `<table>${row("Avoirs émis ce jour", `−${euros(t.refunds)}`)}${row("Net TTC", euros(t.net))}</table>` : ""}
<h2>TVA</h2><table><tr><th>Taux</th><th class="r">HT</th><th class="r">TVA</th><th class="r">TTC</th></tr>
${t.byVat.map((v) => `<tr><td>${vatLabel(v.rate)}</td><td class="r">${euros(v.ht)}</td><td class="r">${euros(v.vat)}</td><td class="r">${euros(v.ttc)}</td></tr>`).join("")}</table>
<h2>Moyens de paiement</h2><table>${Object.entries(t.byPayment).map(([k, v]) => row(`${PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k} (${v.orders})`, `${euros(v.ttc)} — réglé ${euros(v.paid)}`)).join("")}</table>
<h2>Modes</h2><table>${Object.entries(t.byMode).map(([k, v]) => row(`${MODE_LABELS[k as keyof typeof MODE_LABELS] ?? k} (${v.orders})`, euros(v.ttc))).join("")}</table>
<p><small>Empreinte : ${c.hash}<br>Précédente : ${c.previousHash}</small></p>
<p><small>Document de synthèse issu du logiciel de prise de commande. L'encaissement des paiements sur place relève de la caisse enregistreuse du restaurant.</small></p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
