import ExcelJS from "exceljs";
import { centsToEuros, toCsv } from "@/lib/accounting";
import { reportFor } from "@/lib/accounting-db";
import { logAction } from "@/lib/admin";
import { getStaff } from "@/lib/auth/session";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { db } from "@/lib/db";
import type { VatLine } from "@/lib/money";
import { can, restaurantScope } from "@/lib/permissions";
import { formatDateTime, localDate, localHHMM } from "@/lib/time";

/** Export pour le comptable : /admin/compta/export?du=&au=&resto=<id|tous>&format=csv|xlsx */
export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return new Response("Non autorisé", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDate(sp.get("du")) || !isDate(sp.get("au"))) return new Response("Dates invalides", { status: 400 });
  const from = sp.get("du")!;
  const to = sp.get("au")!;
  const restaurants = await db.restaurant.findMany({ where: restaurantScope(staff.actor), select: { id: true, name: true } });
  const allowed = restaurants.filter((r) => can(staff.actor, "accounting.view", r.id));
  const selected = sp.get("resto") === "tous" ? allowed : allowed.filter((r) => r.id === sp.get("resto"));
  if (!selected.length) return new Response("Accès refusé", { status: 403 });
  const names = new Map(selected.map((r) => [r.id, r.name]));
  const { report, orders, refunds } = await reportFor(selected.map((r) => r.id), from, to, "day");
  await logAction(staff, "accounting.export", "Report", "", selected.length === 1 ? selected[0]!.id : null, { from, to, format: sp.get("format") });

  const rates = [...new Set(orders.flatMap((o) => (o.vatBreakdown as unknown as VatLine[]).map((v) => v.rate)))].sort((a, b) => a - b);
  const header = ["Date de service", "Heure", "Restaurant", "Référence", "N° séquentiel", "Statut", "Mode", "Moyen de paiement", "Paiement", "Client",
    ...rates.flatMap((r) => [`HT ${r / 100}%`, `TVA ${r / 100}%`]), "Total HT", "Total TVA", "Remise", "Frais livraison", "Total TTC", "Passée le"];
  const rows = orders.map((o) => {
    const vat = o.vatBreakdown as unknown as VatLine[];
    return [
      localDate(o.slotStart).split("-").reverse().join("/"), localHHMM(o.slotStart), names.get(o.restaurantId) ?? "", o.reference, o.number,
      STATUS_LABELS[o.status], MODE_LABELS[o.mode], PAYMENT_METHOD_LABELS[o.paymentMethod], PAYMENT_STATUS_LABELS[o.paymentStatus], o.customerName,
      ...rates.flatMap((r) => { const v = vat.find((x) => x.rate === r); return [centsToEuros(v?.baseCents ?? 0), centsToEuros(v?.vatCents ?? 0)]; }),
      centsToEuros(vat.reduce((a, v) => a + v.baseCents, 0)), centsToEuros(vat.reduce((a, v) => a + v.vatCents, 0)),
      centsToEuros(o.discountCents), centsToEuros(o.deliveryFeeCents), centsToEuros(o.totalCents), formatDateTime(o.placedAt),
    ];
  });
  const file = `yaoma-ventes-${from}-au-${to}`;

  if (sp.get("format") === "csv") {
    return new Response(toCsv([header, ...rows]), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Yaoma";
  const euro = '#,##0.00 "€"';
  const summary = wb.addWorksheet("Synthèse");
  summary.addRows([
    ["Période", `${from.split("-").reverse().join("/")} au ${to.split("-").reverse().join("/")}`],
    ["Restaurant(s)", selected.map((r) => r.name).join(", ")],
    [],
    ["Commandes", report.orders],
    ["Chiffre d'affaires TTC", centsToEuros(report.ttc)],
    ["Total HT", centsToEuros(report.ht)],
    ["Total TVA", centsToEuros(report.vat)],
    ["Avoirs / remboursements", -centsToEuros(report.refunds)],
    ["Net TTC", centsToEuros(report.netTtc)],
    ["Panier moyen", centsToEuros(report.averageBasket)],
    [],
    ["Taux de TVA", "HT", "TVA", "TTC"],
    ...report.byVat.map((v) => [`${v.rate / 100} %`, centsToEuros(v.ht), centsToEuros(v.vat), centsToEuros(v.ttc)]),
    [],
    ["Moyen de paiement", "Commandes", "TTC", "Réglé"],
    ...Object.entries(report.byPayment).map(([k, v]) => [PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k, v.orders, centsToEuros(v.ttc), centsToEuros(v.paid)]),
    [],
    ["Mode", "Commandes", "TTC"],
    ...Object.entries(report.byMode).map(([k, v]) => [MODE_LABELS[k as keyof typeof MODE_LABELS], v.orders, centsToEuros(v.ttc)]),
  ]);
  summary.getColumn(1).width = 28;
  [2, 3, 4].forEach((c) => (summary.getColumn(c).numFmt = euro));

  const sheet = wb.addWorksheet("Commandes");
  sheet.addRow(header).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  header.forEach((h, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(12, h.length + 2);
    if (/^(HT|TVA|Total|Remise|Frais)/.test(h)) col.numFmt = euro;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const days = wb.addWorksheet("Par jour");
  days.addRow(["Jour", "Commandes", "HT", "TVA", "TTC"]).font = { bold: true };
  report.buckets.forEach((b) => days.addRow([b.label, b.orders, centsToEuros(b.ht), centsToEuros(b.vat), centsToEuros(b.ttc)]));
  [3, 4, 5].forEach((c) => (days.getColumn(c).numFmt = euro));

  const av = wb.addWorksheet("Avoirs");
  av.addRow(["Date", "N° d'avoir", "Commande", "Montant", "Motif"]).font = { bold: true };
  refunds.forEach((x) => av.addRow([formatDateTime(x.createdAt), x.creditNumber, x.order.reference, -centsToEuros(x.amountCents), x.reason]));
  av.getColumn(4).numFmt = euro;

  const prod = wb.addWorksheet("Produits");
  prod.addRow(["Produit", "Quantité", "TTC"]).font = { bold: true };
  report.topProducts.forEach((p) => prod.addRow([p.name, p.quantity, centsToEuros(p.ttc)]));
  prod.getColumn(1).width = 40;
  prod.getColumn(3).numFmt = euro;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}.xlsx"`,
    },
  });
}
