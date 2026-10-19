"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, logAction } from "@/lib/admin";
import { readConfig } from "@/lib/config";
import { ConfigSchema } from "@/lib/config-schema";
import { db } from "@/lib/db";
import { adjustPoints } from "@/lib/loyalty";
import { parseEuros } from "@/lib/money";

type Result = { ok?: string; error?: string } | undefined;
const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "").replace(",", "."));

/** Réglages du programme (activation, points par euro, expiration, bienvenue). */
export async function saveLoyaltySettingsAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("promos.edit");
  const current = await readConfig();
  const parsed = ConfigSchema.safeParse({
    ...current,
    loyalty: {
      enabled: form.get("enabled") === "on",
      pointsPerEuro: num(form, "pointsPerEuro"),
      expiryMonths: num(form, "expiryMonths"),
      signupBonus: num(form, "signupBonus"),
    },
  });
  if (!parsed.success) return { error: `Réglage invalide : ${parsed.error.issues[0]?.path.join(" › ")} — ${parsed.error.issues[0]?.message}` };
  await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, config: parsed.data }, update: { config: parsed.data } });
  await logAction(staff, "loyalty.settings", "SiteSettings", "1", null, parsed.data.loyalty);
  revalidatePath("/", "layout");
  return { ok: parsed.data.loyalty.enabled ? "Carte de fidélité enregistrée et active." : "Réglages enregistrés (carte de fidélité désactivée)." };
}

const Reward = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nom requis").max(80),
  description: z.string().trim().max(300),
  type: z.enum(["AMOUNT", "PERCENT", "FREE_PRODUCT"]),
  pointsCost: z.number().int("Points : nombre entier").min(1, "Coût en points : au moins 1").max(1_000_000),
  minSubtotalCents: z.number().int().min(0),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

/** Création ou modification d'une récompense. */
export async function saveRewardAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("promos.edit");
  const parsed = Reward.safeParse({
    id: String(form.get("id") ?? "") || undefined,
    name: form.get("name"),
    description: String(form.get("description") ?? ""),
    type: form.get("type"),
    pointsCost: num(form, "pointsCost"),
    minSubtotalCents: parseEuros(String(form.get("minSubtotal") ?? "0") || "0") ?? -1,
    active: form.get("active") === "on",
    sortOrder: num(form, "sortOrder") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const r = parsed.data;
  let value = 0;
  let productId: string | null = null;
  if (r.type === "AMOUNT") {
    const cents = parseEuros(String(form.get("amount") ?? ""));
    if (!cents || cents <= 0) return { error: "Indiquez le montant de la remise en euros." };
    value = cents;
  } else if (r.type === "PERCENT") {
    value = num(form, "percent");
    if (!Number.isInteger(value) || value < 1 || value > 100) return { error: "Le pourcentage doit être un nombre entier entre 1 et 100." };
  } else {
    productId = String(form.get("productId") ?? "");
    const product = productId ? await db.product.findUnique({ where: { id: productId }, include: { optionGroups: true } }) : null;
    if (!product || product.archived) return { error: "Choisissez le produit offert." };
    if (product.optionGroups.some((g) => g.minSelect > 0)) return { error: "Ce produit demande un choix obligatoire (options) : il ne peut pas être offert automatiquement." };
  }
  const data = { name: r.name, description: r.description, type: r.type, value, productId, pointsCost: r.pointsCost, minSubtotalCents: r.minSubtotalCents, active: r.active, sortOrder: r.sortOrder };
  const saved = r.id ? await db.loyaltyReward.update({ where: { id: r.id }, data }) : await db.loyaltyReward.create({ data });
  await logAction(staff, r.id ? "loyalty.reward.update" : "loyalty.reward.create", "LoyaltyReward", saved.id, null, data);
  revalidatePath("/admin/fidelite");
  revalidatePath("/fidelite");
  return { ok: r.id ? "Récompense modifiée." : "Récompense créée." };
}

export async function toggleRewardAction(form: FormData) {
  const staff = await authorize("promos.edit");
  const id = String(form.get("id"));
  const reward = await db.loyaltyReward.findUnique({ where: { id } });
  if (!reward) return;
  await db.loyaltyReward.update({ where: { id }, data: { active: !reward.active } });
  await logAction(staff, "loyalty.reward.toggle", "LoyaltyReward", id, null, { active: !reward.active });
  revalidatePath("/admin/fidelite");
}

/** Suppression d'une récompense (l'historique des clients est conservé). */
export async function deleteRewardAction(form: FormData) {
  const staff = await authorize("promos.edit");
  const id = String(form.get("id"));
  await db.loyaltyReward.delete({ where: { id } }).catch(() => {});
  await logAction(staff, "loyalty.reward.delete", "LoyaltyReward", id, null, {});
  revalidatePath("/admin/fidelite");
}

/** Ajout ou retrait manuel de points (geste commercial, correction). */
export async function adjustPointsAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("promos.edit");
  const customerId = String(form.get("customerId") ?? "");
  const points = num(form, "points");
  const note = String(form.get("note") ?? "").trim();
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100_000) return { error: "Indiquez un nombre de points entier (négatif pour retirer)." };
  if (note.length < 3) return { error: "Indiquez le motif (visible par le client)." };
  try {
    const balance = await adjustPoints(customerId, points, note, { userId: staff.user.id, label: staff.user.name });
    revalidatePath("/admin/fidelite");
    return { ok: `${points > 0 ? "+" : ""}${points} point(s). Nouveau solde : ${balance}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
