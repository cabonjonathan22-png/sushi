import ExcelJS from "exceljs";
import { centsToEuros, toCsv } from "@/lib/accounting";
import { loadCancellations, loadClosures, reportFor } from "@/lib/accounting-db";
import { buildFecLines, FEC_HEADER, fecText } from "@/lib/accounting-fec";
import { logAction } from "@/lib/admin";
import { getStaff } from "@/lib/auth/session";
import { MODE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/lib/catalog-constants";
import { readConfig } from "@/lib/config";
import { db } from "@/lib/db";
import type { VatLine } from "@/lib/money";
import { can, restaurantScope } from "@/lib/permissions";
import { getSiteSettings } from "@/lib/restaurants";
import { formatDateTime, localDate, localHHMM } from "@/lib/time";

/**
 * Exports pour l'expert-comptable : /admin/compta/export?du=&au=&resto=<id|tous>&format=xlsx|csv|fec
 *  - xlsx : dossier complet (synthèse, TVA par mois, encaissements, ventes, lignes, avoirs, annulations, clôtures, écritures) ;
 *  - csv  : liste des ventes ;
 *  - fec  : écritures du journal des ventes au format FEC (import dans le logiciel comptable).
 * Seules les commandes du nouveau site sont comptabilisées (l'historique importé en est exclu).
 */
export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return new Response("Non autorisé", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDate(sp.get("du")) || !isDate(sp.get("au"))) return new Response("Dates invalides", { status: 400 });
  const from = sp.get("du")!;
  const to = sp.get("au")!;
  const format = sp.get("format") ?? "xlsx";
  const restaurants = await db.restaurant.findMany({ where: restaurantScope(staff.actor), select: { id: true, name: true } });
  const allowed = restaurants.filter((r) => can(staff.actor, "accounting.view", r.id));
  const selected = sp.get("resto") === "tous" ? allowed : allowed.filter((r) => r.id === sp.get("resto"));
  if (!selected.length) return new Response("Accès refusé", { status: 403 });
  const ids = selected.map((r) => r.id);
  const names = new Map(selected.map((r) => [r.id, r.name]));
  const [{ report, orders, refunds }, cancellations, closures, config, settings] = await Promise.all([
    reportFor(ids, from, to, "day"), loadCancellations(ids, from, to), loadClosures(ids, from, to), readConfig(), getSiteSettings(),
  ]);
  await logAction(staff, "accounting.export", "Report", "", selected.length === 1 ? selected[0]!.id : null, { from, to, format });

  const slug = settings.brandName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ventes";
  const file = `${slug}-${from}-au-${to}`;
  const frDate = (d: string) => d.split("-").reverse().join("/");
  const vatOf = (v: unknown) => v as VatLine[];
  const fecLines = buildFecLines(
    orders.map((o) => ({ ...o, vatBreakdown: vatOf(o.vatBreakdown) })),
    refunds.map((r) => ({ ...r, order: { ...r.order, vatBreakdown: vatOf(r.order.vatBreakdown) } })),
    config.accounting, PAYMENT_METHOD_LABELS,
  );

  if (format === "fec") {
    // Le séparateur tabulation et le CRLF sont ceux attendus par les logiciels comptables français.
    return new Response(fecText(fecLines), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${file}-ecritures-FEC.txt"` },
    });
  }

  const rates = [...new Set(orders.flatMap((o) => vatOf(o.vatBreakdown).map((v) => v.rate)))].sort((a, b) => a - b);
  const header = ["Date de service", "Heure", "Restaurant", "Référence", "N° séquentiel", "Statut", "Mode", "Moyen de paiement", "Paiement", "Client",
    ...rates.flatMap((r) => [`HT ${r / 100}%`, `TVA ${r / 100}%`]), "Total HT", "Total TVA", "Remise", "Petits plus offerts", "Frais livraison", "Total TTC", "Passée le"];
  const rows = orders.map((o) => {
    const vat = vatOf(o.vatBreakdown);
    return [
      frDate(localDate(o.slotStart)), localHHMM(o.slotStart), names.get(o.restaurantId) ?? "", o.reference, o.number,
      STATUS_LABELS[o.status], MODE_LABELS[o.mode], PAYMENT_METHOD_LABELS[o.paymentMethod], PAYMENT_STATUS_LABELS[o.paymentStatus], o.customerName,
      ...rates.flatMap((r) => { const v = vat.find((x) => x.rate === r); return [centsToEuros(v?.baseCents ?? 0), centsToEuros(v?.vatCents ?? 0)]; }),
      centsToEuros(vat.reduce((a, v) => a + v.baseCents, 0)), centsToEuros(vat.reduce((a, v) => a + v.vatCents, 0)),
      centsToEuros(o.discountCents), centsToEuros(o.extrasDiscountCents), centsToEuros(o.deliveryFeeCents), centsToEuros(o.totalCents), formatDateTime(o.placedAt),
    ];
  });

  if (format === "csv") {
    return new Response(toCsv([header, ...rows]), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = settings.brandName;
  const euro = '#,##0.00 "€"';
  const bold = (row: ExcelJS.Row) => { row.font = { bold: true }; return row; };
  const table = (name: string, head: string[], data: (string | number | null)[][], money: number[] = [], widths: Record<number, number> = {}) => {
    const ws = wb.addWorksheet(name);
    bold(ws.addRow(head));
    data.forEach((r) => ws.addRow(r));
    head.forEach((h, i) => (ws.getColumn(i + 1).width = widths[i + 1] ?? Math.max(12, h.length + 2)));
    money.forEach((c) => (ws.getColumn(c).numFmt = euro));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  };

  // 1. Lisez-moi
  const info = wb.addWorksheet("Lisez-moi");
  info.addRows([
    [`Dossier comptable — ${settings.brandName}`],
    ["Période", `du ${frDate(from)} au ${frDate(to)} (date de service, heure de Paris)`],
    ["Restaurant(s)", selected.map((r) => r.name).join(", ")],
    ["Édité le", formatDateTime(new Date())],
    [],
    ["Onglet", "Contenu"],
    ["Synthèse", "Chiffre d'affaires, TVA par taux, moyens de paiement, modes de commande."],
    ["TVA par mois", "Bases HT et TVA collectée par mois et par taux (déclaration de TVA)."],
    ["Encaissements", "Montants TTC par jour et par moyen de paiement (rapprochement caisse / banque / Stripe)."],
    ["Ventes", "Une ligne par commande, ventilée par taux de TVA."],
    ["Lignes", "Détail des articles vendus (quantité, prix, taux de TVA)."],
    ["Avoirs", "Remboursements, à leur date d'émission."],
    ["Annulations", "Commandes annulées (non comptées dans le chiffre d'affaires)."],
    ["Clôtures", "Clôtures journalières figées, avec leur empreinte de contrôle."],
    ["Écritures", `Écritures du journal des ventes (${config.accounting.journalCode}), également fournies au format FEC (.txt).`],
    [],
    ["Règles", "Une vente est rattachée à sa date de service. Les montants sont en euros TTC sauf mention HT. Les commandes de l'ancien site (historique importé) ne sont pas incluses."],
  ]);
  bold(info.getRow(1)).font = { bold: true, size: 14 };
  bold(info.getRow(6));
  info.getColumn(1).width = 18;
  info.getColumn(2).width = 110;

  // 2. Synthèse
  const summary = wb.addWorksheet("Synthèse");
  summary.addRows([
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
    ["Moyen de paiement", "Commandes", "TTC", "Dont réglé"],
    ...Object.entries(report.byPayment).map(([k, v]) => [PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k, v.orders, centsToEuros(v.ttc), centsToEuros(v.paid)]),
    [],
    ["Mode", "Commandes", "TTC"],
    ...Object.entries(report.byMode).map(([k, v]) => [MODE_LABELS[k as keyof typeof MODE_LABELS], v.orders, centsToEuros(v.ttc)]),
  ]);
  summary.getColumn(1).width = 28;
  [2, 3, 4].forEach((c) => (summary.getColumn(c).width = 16));
  for (const r of [2, 3, 4, 5, 6, 7]) summary.getCell(`B${r}`).numFmt = euro;
  summary.eachRow((row) => { if (["Taux de TVA", "Moyen de paiement", "Mode"].includes(String(row.getCell(1).value))) bold(row); });
  summary.getColumn(3).numFmt = euro;
  summary.getColumn(4).numFmt = euro;

  // 3. TVA par mois
  const vatMonth = new Map<string, { ht: number; vat: number }>();
  for (const o of orders) {
    const month = localDate(o.slotStart).slice(0, 7);
    for (const v of vatOf(o.vatBreakdown)) {
      const k = `${month}|${v.rate}`;
      const cur = vatMonth.get(k) ?? { ht: 0, vat: 0 };
      vatMonth.set(k, { ht: cur.ht + v.baseCents, vat: cur.vat + v.vatCents });
    }
  }
  table("TVA par mois", ["Mois", "Taux", "Base HT", "TVA collectée", "TTC"],
    [...vatMonth].sort().map(([k, v]) => { const [m, r] = k.split("|"); return [m!.split("-").reverse().join("/"), `${Number(r) / 100} %`, centsToEuros(v.ht), centsToEuros(v.vat), centsToEuros(v.ht + v.vat)]; }),
    [3, 4, 5]);

  // 4. Encaissements par jour et moyen de paiement
  const methods = Object.keys(PAYMENT_METHOD_LABELS) as (keyof typeof PAYMENT_METHOD_LABELS)[];
  const cash = new Map<string, Record<string, number>>();
  for (const o of orders) {
    const d = localDate(o.slotStart);
    const row = cash.get(d) ?? {};
    row[o.paymentMethod] = (row[o.paymentMethod] ?? 0) + o.totalCents;
    cash.set(d, row);
  }
  table("Encaissements", ["Jour", ...methods.map((m) => PAYMENT_METHOD_LABELS[m]), "Total TTC"],
    [...cash].sort().map(([d, r]) => [frDate(d), ...methods.map((m) => centsToEuros(r[m] ?? 0)), centsToEuros(Object.values(r).reduce((a, b) => a + b, 0))]),
    methods.map((_, i) => i + 2).concat(methods.length + 2));

  // 5. Ventes (une ligne par commande)
  table("Ventes", header, rows, header.map((h, i) => (/^(HT|TVA|Total|Remise|Petits|Frais)/.test(h) ? i + 1 : 0)).filter(Boolean));

  // 6. Lignes d'articles
  table("Lignes", ["Date de service", "Référence", "Catégorie", "Article", "Variante", "Quantité", "Prix unitaire TTC", "Taux TVA", "Total TTC"],
    orders.flatMap((o) => o.lines.map((l) => [frDate(localDate(o.slotStart)), o.reference, l.categoryName, l.name, l.variantLabel, l.quantity, centsToEuros(l.unitPriceCents), `${l.vatRate / 100} %`, centsToEuros(l.totalCents)])),
    [7, 9], { 4: 40 });

  // 7. Avoirs, 8. Annulations, 9. Clôtures
  table("Avoirs", ["Date", "N° d'avoir", "Commande", "Moyen de paiement", "Montant TTC", "Motif"],
    refunds.map((x) => [formatDateTime(x.createdAt), x.creditNumber, x.order.reference, PAYMENT_METHOD_LABELS[x.order.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? x.order.paymentMethod, -centsToEuros(x.amountCents), x.reason]),
    [5], { 6: 40 });
  table("Annulations", ["Date de service", "Annulée le", "Référence", "Restaurant", "Client", "Montant TTC", "Paiement", "Motif"],
    cancellations.map((c) => [frDate(localDate(c.slotStart)), c.cancelledAt ? formatDateTime(c.cancelledAt) : "", c.reference, names.get(c.restaurantId) ?? "", c.customerName, centsToEuros(c.totalCents),
      `${PAYMENT_METHOD_LABELS[c.paymentMethod]} — ${PAYMENT_STATUS_LABELS[c.paymentStatus]}`, c.cancelReason]),
    [6], { 8: 40 });
  table("Clôtures", ["Journée", "Restaurant", "Commandes", "Total TTC", "Clôturée le", "Empreinte (SHA-256)"],
    closures.map((c) => [frDate(c.date), names.get(c.restaurantId) ?? "", c.ordersCount, centsToEuros(c.totalCents), formatDateTime(c.closedAt), c.hash]),
    [4], { 6: 70 });

  // 10. Écritures (lisibles), identiques au fichier FEC
  table("Écritures", FEC_HEADER.slice(0, 13),
    fecLines.map((l) => [l.journalCode, l.journalLib, l.ecritureNum, l.ecritureDate, l.compteNum, l.compteLib, "", "", l.pieceRef, l.pieceDate, l.ecritureLib, centsToEuros(l.debit), centsToEuros(l.credit)]),
    [12, 13], { 11: 40 });

  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 1, visibility: "visible" }];
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}.xlsx"`,
    },
  });
}
