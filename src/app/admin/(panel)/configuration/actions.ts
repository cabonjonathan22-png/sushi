"use server";

import { revalidatePath } from "next/cache";
import { authorize, logAction } from "@/lib/admin";
import { readConfig } from "@/lib/config";
import { ConfigSchema, type AppConfig } from "@/lib/config-schema";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";

type Result = { ok?: string; error?: string } | undefined;

const bool = (f: FormData, k: string) => f.get(k) === "on";
const int = (f: FormData, k: string) => Number(f.get(k));
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Enregistre la configuration générale (validée ; valeurs hors limites refusées). */
export async function saveConfigAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("tech.config");

  // Badges : lignes « CODE;Libellé;#couleur ». Taux de TVA : lignes « 10;Libellé ».
  const badges = str(form, "badges").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [code = "", label = "", color = "#0b0b0b"] = l.split(";").map((x) => x.trim());
    return { code: code.toUpperCase(), label, color };
  });
  const vatRates = str(form, "vatRates").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [rate = "", ...label] = l.split(";");
    return { value: Math.round(Number(rate.replace(",", ".")) * 100), label: label.join(";").trim() || `${rate.trim()} %` };
  });

  // On part de la configuration actuelle : un champ absent du formulaire garde sa valeur.
  const current = await readConfig();
  const has = (k: string) => form.has(k);
  const langs = form.getAll("languages").map(String);
  const apiKey = str(form, "translationApiKey");
  const candidate: AppConfig = {
    ...current,
    orders: {
      autoAccept: bool(form, "autoAccept"),
      requireEmail: bool(form, "requireEmail"),
      allowNotes: bool(form, "allowNotes"),
      notifyStatuses: form.getAll("notifyStatuses").map(String) as AppConfig["orders"]["notifyStatuses"],
      pendingPaymentMinutes: int(form, "pendingPaymentMinutes"),
      maxLineQuantity: int(form, "maxLineQuantity"),
    },
    schedule: { lunchDinnerCutoff: str(form, "lunchDinnerCutoff") },
    printing: { deliveryCopies: int(form, "deliveryCopies"), chimeRepeatSeconds: int(form, "chimeRepeatSeconds") },
    site: {
      ...current.site,
      seoTitle: str(form, "seoTitle"),
      seoDescription: str(form, "seoDescription"),
      footerText: str(form, "footerText"),
      announcement: str(form, "announcement"),
      announcementActive: bool(form, "announcementActive"),
      facebookUrl: str(form, "facebookUrl"),
      instagramUrl: str(form, "instagramUrl"),
      googleReviewUrl: str(form, "googleReviewUrl"),
      ...(has("cuisine") ? {
        cuisine: str(form, "cuisine"), extrasHint: str(form, "extrasHint"),
        searchPlaceholder: str(form, "searchPlaceholder"), notesPlaceholder: str(form, "notesPlaceholder"),
      } : {}),
    },
    region: has("currency") ? {
      country: str(form, "country").toUpperCase(),
      currency: str(form, "currency").toUpperCase(),
      defaultLocale: str(form, "defaultLocale").toLowerCase(),
      languages: [...new Set([str(form, "defaultLocale").toLowerCase(), ...langs])],
      autoDetect: bool(form, "autoDetect"),
    } : current.region,
    translation: has("translationProvider") ? {
      provider: str(form, "translationProvider") as AppConfig["translation"]["provider"],
      // Clé vide = on conserve la clé enregistrée (jamais réaffichée).
      apiKeyEnc: bool(form, "translationClearKey") ? "" : apiKey ? encryptSecret(apiKey) : current.translation.apiKeyEnc,
      endpoint: str(form, "translationEndpoint"),
      email: str(form, "translationEmail"),
    } : current.translation,
    catalog: { badges, vatRates },
    // Plan de comptes de l'export FEC : un champ par taux de TVA et par moyen de paiement.
    accounting: has("acc_journal") ? {
      journalCode: str(form, "acc_journal").toUpperCase(),
      journalLabel: str(form, "acc_journalLabel"),
      sales: Object.fromEntries([...form.keys()].filter((k) => k.startsWith("acc_sales_")).map((k) => [k.slice(10), str(form, k).toUpperCase()]).filter(([, v]) => v)),
      vat: Object.fromEntries([...form.keys()].filter((k) => k.startsWith("acc_vat_")).map((k) => [k.slice(8), str(form, k).toUpperCase()]).filter(([, v]) => v)),
      payment: Object.fromEntries([...form.keys()].filter((k) => k.startsWith("acc_pay_")).map((k) => [k.slice(8), str(form, k).toUpperCase()]).filter(([, v]) => v)),
      defaultSales: str(form, "acc_defaultSales").toUpperCase(),
      defaultVat: str(form, "acc_defaultVat").toUpperCase(),
      defaultPayment: str(form, "acc_defaultPayment").toUpperCase(),
      roundingDebit: str(form, "acc_roundingDebit").toUpperCase(),
      roundingCredit: str(form, "acc_roundingCredit").toUpperCase(),
    } : current.accounting,
    customers: { accountsEnabled: bool(form, "accountsEnabled") },
  };
  const parsed = ConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const i = parsed.error.issues[0]!;
    return { error: `${i.path.join(" › ")} : ${i.message}` };
  }
  const used = await db.product.findMany({ where: { archived: false, badges: { isEmpty: false } }, select: { badges: true } });
  const missing = [...new Set(used.flatMap((p) => p.badges))].filter((c) => !parsed.data.catalog.badges.some((b) => b.code === c));
  if (missing.length) return { error: `Badges encore utilisés par des produits : ${missing.join(", ")}.` };
  const rates = await db.product.findMany({ where: { archived: false }, distinct: ["vatRate"], select: { vatRate: true } });
  const missingRates = rates.filter((r) => !parsed.data.catalog.vatRates.some((v) => v.value === r.vatRate)).map((r) => `${r.vatRate / 100} %`);
  if (missingRates.length) return { error: `Taux de TVA encore utilisés par des produits : ${missingRates.join(", ")}.` };

  await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, config: parsed.data }, update: { config: parsed.data } });
  await logAction(staff, "settings.config", "SiteSettings", "1", null, { ...parsed.data, translation: { ...parsed.data.translation, apiKeyEnc: parsed.data.translation.apiKeyEnc ? "(chiffrée)" : "" } });
  revalidatePath("/", "layout");
  return { ok: "Configuration enregistrée." };
}

/** Services d'un restaurant (sur place, retrait, livraison, visible). */
export async function saveRestaurantServicesAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("restaurant.settings", restaurantId);
  const field = String(form.get("field"));
  if (!["dineInEnabled", "pickupEnabled", "deliveryEnabled", "active"].includes(field)) return;
  const value = form.get("value") === "1";
  await db.restaurant.update({ where: { id: restaurantId }, data: { [field]: value } });
  await logAction(staff, "restaurant.services", "Restaurant", restaurantId, restaurantId, { [field]: value });
  revalidatePath("/", "layout");
}
