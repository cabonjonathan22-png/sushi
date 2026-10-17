/**
 * Historique WooCommerce (import/private/orders.json + customers.json) → base.
 *
 *   npm run import:fetch -- --commandes   # récupère les fichiers (clé API REST requise)
 *   npm run import:orders                 # les insère (relançable : les commandes déjà importées sont ignorées)
 *
 * Les montants sont ceux de WooCommerce (total payé faisant foi). Les commandes importées
 * ont la source IMPORT_WP, la référence WP-<n°> et gardent leur numéro WooCommerce.
 * Les premières commandes (avant le 21/10/2025) n'avaient pas de TVA calculée dans
 * WooCommerce : la ventilation est alors déduite du taux de chaque produit.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/lib/db.ts";
import { allocate, vatBreakdown } from "../src/lib/money.ts";
import { localDate, zonedTime } from "../src/lib/time.ts";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const cents = (v: string | number) => Math.round(Number(v) * 100);
const log = (...m: unknown[]) => console.log("•", ...m);

interface WcMeta { key: string; value: unknown; display_key?: string; display_value?: unknown }
interface WcLine {
  name: string; product_id: number; variation_id: number; quantity: number;
  subtotal: string; subtotal_tax: string; total: string; total_tax: string;
  taxes: { id: number; total: string }[]; meta_data: WcMeta[];
}
interface WcAddress { first_name: string; last_name: string; address_1: string; address_2: string; city: string; postcode: string; phone?: string; email?: string }
interface WcOrder {
  id: number; number: string; status: string; date_created_gmt: string; date_paid_gmt: string | null;
  total: string; shipping_total: string; shipping_tax: string; customer_id: number; payment_method: string; customer_note: string;
  billing: WcAddress & { email: string; phone: string }; shipping: WcAddress;
  line_items: WcLine[]; tax_lines: { rate_id: number; rate_percent: number }[];
  shipping_lines: { method_id: string; method_title: string }[]; fee_lines: { total: string; total_tax: string }[];
  coupon_lines: { code: string }[]; refunds: { id: number; reason: string; total: string }[]; meta_data: WcMeta[];
}
interface WcCustomer { id: number; email: string; first_name: string; last_name: string; billing: { phone: string } }

function meta(o: WcOrder, key: string): string {
  const m = o.meta_data.find((x) => x.key === key);
  return m ? String(m.value ?? "") : "";
}

async function main() {
  const orders = JSON.parse(await readFile(path.join(ICI, "private", "orders.json"), "utf8")) as WcOrder[];
  const wcCustomers = JSON.parse(await readFile(path.join(ICI, "private", "customers.json"), "utf8")) as WcCustomer[];
  const restaurant = await db.restaurant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  log(`${orders.length} commandes, ${wcCustomers.length} clients → ${restaurant.name}`);

  // Clients (sans mot de passe : ils utiliseront « créer mon compte / mot de passe oublié »).
  const customerIds = new Map<number, string>();
  for (const c of wcCustomers) {
    const email = c.email.trim().toLowerCase();
    if (!email) continue;
    const existing = (await db.customer.findUnique({ where: { wpId: c.id } })) ?? (await db.customer.findUnique({ where: { email } }));
    const saved = existing
      ? await db.customer.update({ where: { id: existing.id }, data: { wpId: c.id } })
      : await db.customer.create({ data: { email, wpId: c.id, firstName: c.first_name, lastName: c.last_name, phone: c.billing.phone ?? "" } });
    customerIds.set(c.id, saved.id);
  }

  const products = await db.product.findMany({ where: { wpId: { not: null } }, select: { id: true, wpId: true, vatRate: true, isAlcohol: true, categories: { take: 1, select: { category: { select: { name: true } } } } } });
  const byWp = new Map(products.map((p) => [p.wpId!, p]));
  const variants = new Map((await db.productVariant.findMany({ where: { wpId: { not: null } }, select: { id: true, wpId: true } })).map((v) => [v.wpId!, v.id]));

  let created = 0;
  let skipped = 0;
  let mismatches = 0;
  for (const o of [...orders].sort((a, b) => a.date_created_gmt.localeCompare(b.date_created_gmt))) {
    const reference = `WP-${o.number}`;
    if (await db.order.findUnique({ where: { reference }, select: { id: true } })) {
      skipped++;
      continue;
    }
    const placedAt = new Date(`${o.date_created_gmt}Z`);

    // Créneau : date Orderable + heure si disponible, sinon date de commande.
    const ts = Number(meta(o, "_orderable_order_timestamp"));
    const time = meta(o, "orderable_order_time").match(/(\d{1,2})[:h](\d{2})/);
    const day = ts ? localDate(new Date(ts * 1000)) : localDate(placedAt);
    const slotStart = time ? zonedTime(day, `${time[1]!.padStart(2, "0")}:${time[2]}`) : placedAt;

    const service = meta(o, "_orderable_service_type");
    const mode = service === "delivery" || (!service && o.shipping_lines.some((s) => s.method_id !== "pickup_location")) ? "DELIVERY" : "PICKUP";
    const ratePct = new Map(o.tax_lines.map((t) => [t.rate_id, t.rate_percent]));

    const lines = o.line_items.map((l, i) => {
      const p = byWp.get(l.product_id);
      const rate = l.taxes[0] ? Math.round((ratePct.get(l.taxes[0].id) ?? 10) * 100) : p?.vatRate ?? 1000;
      const gross = cents(l.subtotal) + cents(l.subtotal_tax);
      const net = cents(l.total) + cents(l.total_tax);
      const variantLabel = l.meta_data.filter((m) => !m.key.startsWith("_") && m.display_value != null).map((m) => String(m.display_value)).join(" · ");
      return {
        productId: p?.id ?? null, variantId: l.variation_id ? variants.get(l.variation_id) ?? null : null,
        // WooCommerce ajoute la variante au nom (« Gyozas – 3, Vapeur ») : on la retire, elle est dans variantLabel.
        name: (l.variation_id && variantLabel ? l.name.replace(/ - [^-]+$/, "") : l.name).replace(/ - /g, " – "), variantLabel, options: [], categoryName: p?.categories[0]?.category.name ?? "",
        unitPriceCents: Math.round(gross / Math.max(1, l.quantity)), quantity: l.quantity, vatRate: rate,
        totalCents: gross, isAlcohol: p?.isAlcohol ?? false, sortOrder: i, net,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.totalCents, 0);
    const couponDiscount = lines.reduce((s, l) => s + (l.totalCents - l.net), 0);
    const extrasDiscount = -o.fee_lines.reduce((s, f) => s + cents(f.total) + cents(f.total_tax), 0);
    const fee = cents(o.shipping_total) + cents(o.shipping_tax);
    const total = cents(o.total);
    if (subtotal - couponDiscount - extrasDiscount + fee !== total) mismatches++;

    // Ventilation TVA : lignes nettes, remise « accompagnements » et frais au prorata, total WooCommerce faisant foi.
    const nets = lines.map((l) => l.net);
    const extraParts = allocate(extrasDiscount, nets);
    const afterExtras = nets.map((n, i) => n - extraParts[i]!);
    const feeParts = allocate(fee, afterExtras);
    const amounts = lines.map((l, i) => ({ rate: l.vatRate, ttcCents: afterExtras[i]! + feeParts[i]! }));
    const diff = total - amounts.reduce((s, a) => s + a.ttcCents, 0);
    if (amounts.length && diff) amounts[0]!.ttcCents += diff;

    const cancelled = o.status === "cancelled" || o.status === "failed";
    const refunded = o.refunds.reduce((s, r) => s - cents(r.total), 0);
    const paid = !cancelled;
    const method = o.payment_method === "cod" ? "CASH" : "ONLINE_CARD";
    const address = o.shipping.address_1 ? o.shipping : o.billing;

    await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          restaurantId: restaurant.id, number: o.id, dailyNumber: Number(o.number) || o.id, reference,
          trackingToken: randomBytes(24).toString("base64url"), source: "IMPORT_WP",
          status: cancelled ? "CANCELLED" : "COMPLETED",
          paymentStatus: o.status === "failed" ? "FAILED" : cancelled ? "UNPAID" : refunded >= total && refunded > 0 ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : "PAID",
          paymentMethod: method, mode, period: Number(slotStart.toLocaleString("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" })) < 16 ? "LUNCH" : "DINNER",
          slotStart, slotEnd: new Date(slotStart.getTime() + 15 * 60_000),
          customerId: o.customer_id ? customerIds.get(o.customer_id) ?? null : null,
          customerName: `${o.billing.first_name} ${o.billing.last_name}`.trim() || "Client",
          customerPhone: o.billing.phone ?? "", customerEmail: (o.billing.email ?? "").toLowerCase(),
          addressStreet: mode === "DELIVERY" ? address.address_1 : "", addressExtra: mode === "DELIVERY" ? address.address_2 : "",
          postalCode: mode === "DELIVERY" ? address.postcode : "", city: mode === "DELIVERY" ? address.city : "",
          notes: o.customer_note ?? "", promoCode: o.coupon_lines.map((c) => c.code.toUpperCase()).join(","),
          subtotalCents: subtotal, discountCents: couponDiscount, extrasDiscountCents: extrasDiscount, deliveryFeeCents: fee, totalCents: total,
          vatBreakdown: vatBreakdown(amounts) as unknown as object,
          placedAt, completedAt: cancelled ? null : slotStart, cancelledAt: cancelled ? placedAt : null,
          cancelReason: cancelled ? `WooCommerce : ${o.status}` : "",
          lines: { create: lines.map(({ net: _n, ...l }) => l) },
          statusEvents: { create: { from: null, to: cancelled ? "CANCELLED" : "COMPLETED", at: placedAt, actor: "Import WordPress", note: `Statut WooCommerce : ${o.status}` } },
        },
      });
      if (paid) await tx.payment.create({ data: { orderId: created.id, method, amountCents: total, status: "SUCCEEDED", createdAt: o.date_paid_gmt ? new Date(`${o.date_paid_gmt}Z`) : placedAt } });
      for (const r of o.refunds) {
        await tx.refund.create({ data: { orderId: created.id, creditNumber: `AV-WP-${r.id}`, amountCents: -cents(r.total), reason: r.reason || "Remboursement WooCommerce", createdAt: placedAt } });
      }
    });
    created++;
    if (created % 250 === 0) log(`${created} importées…`);
  }

  // Les nouvelles commandes continueront la numérotation après la dernière commande WooCommerce.
  const max = await db.order.aggregate({ where: { restaurantId: restaurant.id }, _max: { number: true } });
  const key = `order:${restaurant.id}`;
  const current = await db.counter.findUnique({ where: { key } });
  if ((current?.value ?? 0) < (max._max.number ?? 0)) {
    await db.counter.upsert({ where: { key }, create: { key, value: max._max.number! }, update: { value: max._max.number! } });
  }
  log(`Terminé : ${created} importées, ${skipped} déjà présentes, ${mismatches} avec un écart d'arrondi (total WooCommerce conservé). Prochain n° : ${(max._max.number ?? 0) + 1}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✖ Import de l'historique interrompu :", e);
  await db.$disconnect();
  process.exit(1);
});
