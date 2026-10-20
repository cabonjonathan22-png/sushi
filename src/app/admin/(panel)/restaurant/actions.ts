"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { ADMIN_RESTAURANT_COOKIE, authorize, logAction } from "@/lib/admin";
import { readConfig } from "@/lib/config";
import { encryptSecret, randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { parseEuros } from "@/lib/money";
import { slugify } from "@/lib/text-utils";
import { createPairingCode, formatCode } from "@/lib/pairing";
import { testDirect } from "@/lib/print/direct";
import { parseAddress } from "@/lib/print/jobs";

type Result = { ok?: string; error?: string } | undefined;
const done = (msg = "Enregistré.") => {
  revalidatePath("/admin/restaurant");
  revalidatePath("/", "layout");
  return { ok: msg };
};
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ───────────── Informations, services, créneaux ─────────────

const Info = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
  street: z.string().trim().min(1, "Adresse requise").max(160),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Code postal invalide"),
  city: z.string().trim().min(1).max(80),
  phones: z.array(z.string().regex(/^\+?[0-9 .]{8,20}$/, "Téléphone invalide")).max(4),
  email: z.union([z.literal(""), z.string().email("E-mail invalide")]),
  mapsUrl: z.union([z.literal(""), z.string().url("Lien Google Maps invalide")]),
  description: z.string().trim().max(1500),
  alertEmails: z.array(z.string().email("E-mail d'alerte invalide")).max(10),
});

export async function saveInfoAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", id);
  const parsed = Info.safeParse({
    name: form.get("name"), street: form.get("street"), postalCode: form.get("postalCode"), city: form.get("city"),
    phones: lines(form.get("phones")), email: String(form.get("email") ?? "").trim(), mapsUrl: String(form.get("mapsUrl") ?? "").trim(),
    description: form.get("description") ?? "", alertEmails: lines(form.get("alertEmails")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  await db.restaurant.update({ where: { id }, data: parsed.data });
  await logAction(staff, "restaurant.info", "Restaurant", id, id, parsed.data);
  return done();
}

export async function saveServicesAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", id);
  const num = (k: string, min: number, max: number) => {
    const n = Number(form.get(k));
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const prepMinutes = num("prepMinutes", 0, 240);
  const slotMinutes = num("slotMinutes", 5, 120);
  const maxDaysAhead = num("maxDaysAhead", 0, 30);
  const maxRaw = String(form.get("maxOrdersPerSlot") ?? "").trim();
  const maxOrdersPerSlot = maxRaw ? num("maxOrdersPerSlot", 1, 500) : null;
  const pickupMinimumCents = parseEuros(String(form.get("pickupMinimum") ?? "0") || "0");
  if (prepMinutes === null || slotMinutes === null || maxDaysAhead === null || (maxRaw && maxOrdersPerSlot === null) || pickupMinimumCents === null) {
    return { error: "Vérifiez les valeurs numériques." };
  }
  const data = {
    pickupEnabled: form.get("pickupEnabled") === "on",
    deliveryEnabled: form.get("deliveryEnabled") === "on",
    dineInEnabled: form.get("dineInEnabled") === "on",
    noAlcoholDelivery: form.get("noAlcoholDelivery") === "on",
    active: form.get("active") === "on",
    prepMinutes, slotMinutes, maxDaysAhead, maxOrdersPerSlot, pickupMinimumCents,
  };
  await db.restaurant.update({ where: { id }, data });
  await logAction(staff, "restaurant.services", "Restaurant", id, id, data);
  return done();
}

// ───────────── Horaires et fermetures ─────────────

const Range = z.object({ weekday: z.number().int().min(0).max(6), opens: z.string().regex(HHMM), closes: z.string().regex(HHMM), period: z.enum(["LUNCH", "DINNER"]) });

export async function saveHoursAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", id);
  let ranges: z.infer<typeof Range>[];
  try {
    ranges = z.array(Range).max(42).parse(JSON.parse(String(form.get("hours") ?? "[]")));
  } catch {
    return { error: "Horaires invalides (format HH:MM)." };
  }
  if (ranges.some((r) => r.opens >= r.closes)) return { error: "Chaque plage doit fermer après son ouverture." };
  const cutoff = (await readConfig()).schedule.lunchDinnerCutoff;
  ranges = ranges.map((r) => ({ ...r, period: r.opens < cutoff ? "LUNCH" : "DINNER" }));
  for (let d = 0; d < 7; d++) {
    const day = ranges.filter((r) => r.weekday === d).sort((a, b) => a.opens.localeCompare(b.opens));
    for (let i = 1; i < day.length; i++) if (day[i]!.opens < day[i - 1]!.closes) return { error: "Deux plages se chevauchent le même jour." };
  }
  await db.$transaction([
    db.openingHour.deleteMany({ where: { restaurantId: id } }),
    db.openingHour.createMany({ data: ranges.map((r) => ({ ...r, restaurantId: id })) }),
  ]);
  await logAction(staff, "restaurant.hours", "Restaurant", id, id, { ranges });
  return done("Horaires enregistrés.");
}

export async function addClosureAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", id);
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "") || startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return { error: "Dates invalides." };
  const c = await db.closurePeriod.create({ data: { restaurantId: id, startDate, endDate, reason: String(form.get("reason") ?? "").slice(0, 120) } });
  await logAction(staff, "restaurant.closure_add", "ClosurePeriod", c.id, id, { startDate, endDate });
  return done("Fermeture ajoutée.");
}

export async function deleteClosureAction(form: FormData) {
  const c = await db.closurePeriod.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", c.restaurantId);
  await db.closurePeriod.delete({ where: { id: c.id } });
  await logAction(staff, "restaurant.closure_delete", "ClosurePeriod", c.id, c.restaurantId);
  done();
}

// ───────────── Zones de livraison ─────────────

/** « 84160 Cadenet » ou « 84160 - Cadenet » par ligne. */
function parseAreas(text: string): { postalCode: string; city: string }[] | string {
  const out: { postalCode: string; city: string }[] = [];
  for (const raw of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = raw.match(/^(\d{5})\s*[-–:]?\s*(.+)$/);
    if (!m) return `Ligne non comprise : « ${raw} » (attendu : 84160 Cadenet)`;
    out.push({ postalCode: m[1]!, city: m[2]!.trim() });
  }
  return out;
}

export async function saveZoneAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", restaurantId);
  const zoneId = String(form.get("zoneId") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Nom de zone requis." };
  const areas = parseAreas(String(form.get("areas") ?? ""));
  if (typeof areas === "string") return { error: areas };
  if (!areas.length) return { error: "Ajoutez au moins une commune." };
  const money = (k: string) => parseEuros(String(form.get(k) ?? "0") || "0");
  const minLunchCents = money("minLunch");
  const minDinnerCents = money("minDinner");
  const feeCents = money("fee");
  const freeRaw = String(form.get("freeFrom") ?? "").trim();
  const freeFromCents = freeRaw ? parseEuros(freeRaw) : null;
  const etaMinutes = Number(form.get("etaMinutes"));
  if ([minLunchCents, minDinnerCents, feeCents].includes(null) || (freeRaw && freeFromCents === null) || !Number.isInteger(etaMinutes) || etaMinutes < 0 || etaMinutes > 240) {
    return { error: "Vérifiez les montants et le délai." };
  }
  const data = {
    name, minLunchCents: minLunchCents!, minDinnerCents: minDinnerCents!, feeCents: feeCents!, freeFromCents, etaMinutes,
    active: form.get("active") === "on",
  };
  const unique = [...new Map(areas.map((a) => [`${a.postalCode}|${a.city.toLowerCase()}`, a])).values()];
  const id = await db.$transaction(async (tx) => {
    const zone = zoneId
      ? await tx.deliveryZone.update({ where: { id: zoneId, restaurantId }, data })
      : await tx.deliveryZone.create({ data: { ...data, restaurantId, sortOrder: await tx.deliveryZone.count({ where: { restaurantId } }) } });
    await tx.deliveryZoneArea.deleteMany({ where: { zoneId: zone.id } });
    await tx.deliveryZoneArea.createMany({ data: unique.map((a) => ({ ...a, zoneId: zone.id })) });
    return zone.id;
  });
  await logAction(staff, zoneId ? "zone.update" : "zone.create", "DeliveryZone", id, restaurantId, { ...data, areas: unique });
  return done("Zone enregistrée.");
}

export async function deleteZoneAction(form: FormData) {
  const z = await db.deliveryZone.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", z.restaurantId);
  await db.deliveryZone.delete({ where: { id: z.id } });
  await logAction(staff, "zone.delete", "DeliveryZone", z.id, z.restaurantId, { name: z.name });
  done();
}

// ───────────── Paiements ─────────────

const METHODS = ["ONLINE_CARD", "CASH", "CARD_TERMINAL", "MEAL_VOUCHER_PAPER", "MEAL_VOUCHER_CARD"] as const;

export async function savePaymentMethodsAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", restaurantId);
  const rows = METHODS.map((method) => ({
    method,
    pickup: form.get(`${method}:PICKUP`) === "on",
    delivery: form.get(`${method}:DELIVERY`) === "on",
    dineIn: form.get(`${method}:DINE_IN`) === "on",
  })).filter((r) => r.pickup || r.delivery || r.dineIn);
  await db.$transaction([
    db.restaurantPaymentMethod.deleteMany({ where: { restaurantId } }),
    db.restaurantPaymentMethod.createMany({ data: rows.map((r) => ({ ...r, restaurantId })) }),
  ]);
  await logAction(staff, "restaurant.payment_methods", "Restaurant", restaurantId, restaurantId, { rows });
  return done("Moyens de paiement enregistrés.");
}

/** Clés Stripe du restaurant : chiffrées en base, jamais réaffichées en clair. */
export async function saveStripeAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("tech.config", restaurantId);
  const pk = String(form.get("publishableKey") ?? "").trim();
  const sk = String(form.get("secretKey") ?? "").trim();
  const wh = String(form.get("webhookSecret") ?? "").trim();
  if (pk && !/^pk_(test|live)_[A-Za-z0-9]+$/.test(pk)) return { error: "Clé publiable invalide (pk_…)." };
  if (sk && !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(sk)) return { error: "Clé secrète invalide (sk_… ou rk_…)." };
  if (wh && !/^whsec_[A-Za-z0-9]+$/.test(wh)) return { error: "Secret de webhook invalide (whsec_…)." };
  if (pk && sk && pk.split("_")[1] !== sk.split("_")[1]) return { error: "Les clés ne sont pas du même mode (test / live)." };
  await db.restaurant.update({
    where: { id: restaurantId },
    data: {
      ...(pk ? { stripePublishableKey: pk } : {}),
      ...(sk ? { stripeSecretKeyEnc: encryptSecret(sk) } : {}),
      ...(wh ? { stripeWebhookSecretEnc: encryptSecret(wh) } : {}),
      ...(form.get("clear") === "on" ? { stripePublishableKey: "", stripeSecretKeyEnc: "", stripeWebhookSecretEnc: "" } : {}),
    },
  });
  await logAction(staff, "restaurant.stripe", "Restaurant", restaurantId, restaurantId, { publishable: !!pk, secret: !!sk, webhook: !!wh, cleared: form.get("clear") === "on" });
  return done("Paramètres Stripe enregistrés.");
}

// ───────────── Imprimantes ─────────────

export async function savePrinterAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", restaurantId);
  const printerId = String(form.get("printerId") ?? "");
  const method = String(form.get("method"));
  const paper = String(form.get("paperWidth"));
  if (!["BROWSER", "STAR_CLOUDPRNT", "EPSON_SDP", "PRINTNODE", "LOCAL_AGENT", "BIZPRINT", "DIRECT_TCP"].includes(method) || !["MM58", "MM80", "A4"].includes(paper)) return { error: "Réglage invalide." };
  const data = {
    name: String(form.get("name") ?? "").trim().slice(0, 60) || "Imprimante",
    method: method as "BROWSER",
    paperWidth: paper as "MM80",
    copies: Math.min(3, Math.max(1, Number(form.get("copies")) || 1)),
    autoPrint: form.get("autoPrint") === "on",
    active: form.get("active") === "on",
    remotePrinterId: String(form.get("remotePrinterId") ?? "").replace(/\D/g, ""),
    address: String(form.get("address") ?? "").trim().replace(/\s/g, ""),
  };
  if (data.address && !parseAddress(data.address)) return { error: "Adresse de l'imprimante invalide (ex. 192.168.1.87 ou mabox.fr:9100)." };
  if (method === "DIRECT_TCP" && !data.address) return { error: "Indiquez l'adresse publique de la box (ex. 82.64.12.34:9100)." };
  const p = printerId
    ? await db.printer.update({ where: { id: printerId, restaurantId }, data })
    : await db.printer.create({ data: { ...data, restaurantId, deviceToken: randomToken(24) } });
  await logAction(staff, printerId ? "printer.update" : "printer.create", "Printer", p.id, restaurantId, data);
  return done("Imprimante enregistrée.");
}

export async function deletePrinterAction(form: FormData) {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", p.restaurantId);
  await db.printer.delete({ where: { id: p.id } });
  await logAction(staff, "printer.delete", "Printer", p.id, p.restaurantId);
  done();
}

export async function rotatePrinterTokenAction(form: FormData) {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", p.restaurantId);
  await db.printer.update({ where: { id: p.id }, data: { deviceToken: randomToken(24) } });
  await logAction(staff, "printer.token_rotated", "Printer", p.id, p.restaurantId);
  done();
}

/** Code d'installation du poste d'impression (à saisir sur l'ordinateur du restaurant). */
export async function printerCodeAction(_: Result, form: FormData): Promise<Result> {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", p.restaurantId);
  const code = await createPairingCode("PRINTER", p.restaurantId, staff.user.id, p.id);
  await logAction(staff, "printer.install_code", "Printer", p.id, p.restaurantId);
  return { ok: `Code : ${formatCode(code)} — valable 30 minutes.` };
}

/** Ticket d'essai : immédiat en impression directe, au prochain passage (3 s) du poste d'impression. */
export async function printerTestAction(_: Result, form: FormData): Promise<Result> {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  await authorize("restaurant.settings", p.restaurantId);
  if (p.method === "DIRECT_TCP") {
    try {
      await testDirect(p.id);
      return done("Ticket d'essai envoyé : il doit sortir de l'imprimante.");
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  if (!p.address) return { error: "Choisissez d'abord l'imprimante (liste ci-dessus ou adresse)." };
  await db.printer.update({ where: { id: p.id }, data: { testRequestedAt: new Date() } });
  return done("Ticket d'essai demandé : il sort dans quelques secondes si le poste est en ligne. Le résultat s'affiche ci-dessus.");
}

/** Nouvelle recherche des imprimantes du réseau par le poste d'impression. */
export async function printerScanAction(form: FormData) {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  await authorize("restaurant.settings", p.restaurantId);
  await db.printer.update({ where: { id: p.id }, data: { scanRequestedAt: new Date() } });
  done();
}

/** Choix de l'imprimante trouvée par le poste. */
export async function printerUseAddressAction(form: FormData) {
  const p = await db.printer.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("restaurant.settings", p.restaurantId);
  const address = String(form.get("address") ?? "");
  if (!parseAddress(address)) return;
  await db.printer.update({ where: { id: p.id }, data: { address } });
  await logAction(staff, "printer.address", "Printer", p.id, p.restaurantId, { address });
  done();
}

// ───────────── Tablette ─────────────

/** Code d'installation de la tablette (connexion sans mot de passe, sur ce restaurant). */
export async function tabletCodeAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("users.manage", restaurantId);
  const code = await createPairingCode("TABLET", restaurantId, staff.user.id);
  await logAction(staff, "device.pairing_code", "Restaurant", restaurantId, restaurantId);
  return { ok: `Code : ${formatCode(code)} — valable 30 minutes.` };
}

/** Tablette perdue ou remplacée : déconnectée immédiatement. */
export async function revokeTabletAction(form: FormData) {
  const user = await db.user.findFirstOrThrow({ where: { id: String(form.get("id")), device: true }, include: { restaurants: true } });
  const staff = await authorize("users.manage", user.restaurants[0]?.restaurantId);
  await db.$transaction([db.session.deleteMany({ where: { userId: user.id } }), db.user.update({ where: { id: user.id }, data: { active: false } })]);
  await logAction(staff, "device.revoked", "User", user.id, user.restaurants[0]?.restaurantId ?? null);
  done();
}

/** Clés de l'application BizPrint (print.bizswoop.app → Applications). Secrète chiffrée. */
export async function saveBizPrintAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("tech.config", restaurantId);
  const publicKey = String(form.get("publicKey") ?? "").trim();
  const secretKey = String(form.get("secretKey") ?? "").trim();
  if (form.get("clear") === "on") {
    await db.restaurant.update({ where: { id: restaurantId }, data: { bizprintPublicKey: "", bizprintSecretEnc: "" } });
  } else {
    if (publicKey && !/^[A-Za-z0-9_-]{8,200}$/.test(publicKey)) return { error: "Clé publique invalide." };
    if (secretKey && !/^[A-Za-z0-9_-]{8,200}$/.test(secretKey)) return { error: "Clé secrète invalide." };
    await db.restaurant.update({
      where: { id: restaurantId },
      data: { ...(publicKey ? { bizprintPublicKey: publicKey } : {}), ...(secretKey ? { bizprintSecretEnc: encryptSecret(secretKey) } : {}) },
    });
  }
  await logAction(staff, "restaurant.bizprint", "Restaurant", restaurantId, restaurantId, { publicKey: !!publicKey, secret: !!secretKey, cleared: form.get("clear") === "on" });
  return done("Clés BizPrint enregistrées.");
}

// ───────────── Nouveau restaurant ─────────────

export async function createRestaurantAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("restaurant.create");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const city = String(form.get("city") ?? "").trim().slice(0, 80);
  if (!name || !city) return { error: "Nom et ville requis." };
  let slug = slugify(city) || slugify(name);
  for (let i = 2; await db.restaurant.findUnique({ where: { slug } }); i++) slug = `${slugify(city)}-${i}`;
  const r = await db.restaurant.create({
    data: {
      name, city, slug, street: "", postalCode: "00000", active: false, // inactif tant qu'il n'est pas configuré
      paymentMethods: { create: [{ method: "CASH" }, { method: "CARD_TERMINAL" }] },
      printers: { create: [{ name: "Navigateur (comptoir)", method: "BROWSER", deviceToken: randomToken(24) }] },
    },
  });
  await logAction(staff, "restaurant.create", "Restaurant", r.id, r.id, { name, city });
  // Le nouveau restaurant devient le restaurant sélectionné dans le back-office.
  (await cookies()).set(ADMIN_RESTAURANT_COOKIE, r.id, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.NODE_ENV === "production", maxAge: 31536000 });
  redirect("/admin/restaurant?nouveau=1");
}

// ───────────── Suppression / archivage ─────────────

/**
 * Suppression définitive : seulement si le restaurant n'a jamais enregistré de commande
 * (ni clôture de caisse). Sinon, la loi impose de garder ses ventes : on l'archive.
 * Le nom doit être retapé pour confirmer ; le dernier restaurant ne peut pas être supprimé.
 */
export async function deleteRestaurantAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.create");
  const r = await db.restaurant.findUnique({ where: { id }, include: { _count: { select: { orders: true, closuresDaily: true } } } });
  if (!r) return { error: "Restaurant introuvable." };
  if (String(form.get("confirmName") ?? "").trim().toLowerCase() !== r.name.trim().toLowerCase()) return { error: `Pour confirmer, tapez exactement le nom « ${r.name} ».` };
  if ((await db.restaurant.count({ where: { archivedAt: null, id: { not: id } } })) === 0) return { error: "C'est le seul restaurant : il ne peut pas être supprimé." };
  if (r._count.orders || r._count.closuresDaily) {
    return { error: `Ce restaurant a ${r._count.orders} commande(s) enregistrée(s) : la loi impose de conserver ses ventes (6 ans). Utilisez « Archiver » : il disparaît du site et du back-office, ses ventes restent dans les exports comptables.` };
  }
  await db.$transaction(async (tx) => {
    // Le reste (horaires, zones, imprimantes, prix propres, accès des utilisateurs…) est supprimé en cascade.
    const tablets = await tx.user.findMany({ where: { device: true, restaurants: { some: { restaurantId: id } } }, select: { id: true } });
    await tx.user.deleteMany({ where: { id: { in: tablets.map((t) => t.id) } } });
    await tx.pairingCode.deleteMany({ where: { restaurantId: id } });
    await tx.translation.deleteMany({ where: { entityType: "restaurant", entityId: id } });
    await tx.counter.deleteMany({ where: { key: { contains: id } } });
    await tx.$executeRaw`UPDATE "PromoCode" SET "restaurantIds" = array_remove("restaurantIds", ${id}) WHERE ${id} = ANY("restaurantIds")`;
    await tx.restaurant.delete({ where: { id } });
  });
  await logAction(staff, "restaurant.delete", "Restaurant", id, null, { name: r.name, slug: r.slug });
  (await cookies()).delete({ name: ADMIN_RESTAURANT_COOKIE, path: "/admin" });
  revalidatePath("/", "layout");
  redirect("/admin?supprime=1");
}

/** Archivage : restaurant fermé définitivement, masqué partout, ventes conservées. */
export async function archiveRestaurantAction(_: Result, form: FormData): Promise<Result> {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.create");
  const r = await db.restaurant.findUnique({ where: { id } });
  if (!r) return { error: "Restaurant introuvable." };
  if (String(form.get("confirmName") ?? "").trim().toLowerCase() !== r.name.trim().toLowerCase()) return { error: `Pour confirmer, tapez exactement le nom « ${r.name} ».` };
  if ((await db.restaurant.count({ where: { archivedAt: null, id: { not: id } } })) === 0) return { error: "C'est le seul restaurant : il ne peut pas être archivé." };
  await db.$transaction([
    db.restaurant.update({ where: { id }, data: { archivedAt: new Date(), active: false } }),
    db.printer.updateMany({ where: { restaurantId: id }, data: { active: false } }),
    db.session.deleteMany({ where: { user: { device: true, restaurants: { some: { restaurantId: id } } } } }),
  ]);
  await logAction(staff, "restaurant.archive", "Restaurant", id, id, { name: r.name });
  (await cookies()).delete({ name: ADMIN_RESTAURANT_COOKIE, path: "/admin" });
  revalidatePath("/", "layout");
  redirect("/admin?archive=1");
}

/** Restaurant archivé remis dans le back-office (inactif : à réactiver dans « Services »). */
export async function restoreRestaurantAction(form: FormData) {
  const id = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.create");
  await db.restaurant.update({ where: { id }, data: { archivedAt: null } });
  await logAction(staff, "restaurant.restore", "Restaurant", id, id);
  (await cookies()).set(ADMIN_RESTAURANT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.NODE_ENV === "production", maxAge: 31536000 });
  redirect("/admin/restaurant");
}
