"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize, logAction } from "@/lib/admin";
import { readConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { balanceOf, lockCustomer } from "@/lib/loyalty";
import { ensureCardNumber, parseCardInput } from "@/lib/loyalty-card";
import { pointsFor } from "@/lib/loyalty-rules";
import { euros, parseEuros } from "@/lib/money";

/**
 * Carte de fidélité au comptoir (tablette, PC) : retrouver un client par sa carte, créditer
 * un achat fait au restaurant, utiliser une récompense, créer une carte pour un nouveau client.
 * Ouvert aux employés (droit « encaisser »), chaque opération est inscrite au journal.
 */

type Result = { ok?: string; error?: string } | undefined;
const MAX_PURCHASE_CENTS = 1_000_00;

async function customerByCard(number: string) {
  const c = await db.customer.findUnique({ where: { cardNumber: number } });
  return c && !c.anonymizedAt ? c : null;
}

/** Carte scannée ou saisie (n°, adresse du QR code), ou client retrouvé par e-mail / téléphone. */
export async function findCardAction(_: Result, form: FormData): Promise<Result> {
  await authorize("orders.payment");
  const raw = String(form.get("q") ?? "").trim();
  if (!raw) return { error: "Scannez la carte ou tapez son numéro." };
  const number = parseCardInput(raw);
  if (number) {
    if (!(await customerByCard(number))) return { error: "Carte inconnue." };
    redirect(`/admin/fidelite/carte/${number}`);
  }
  // Carte oubliée : e-mail ou téléphone du client.
  const digits = raw.replace(/\D/g, "");
  let id: string | null = null;
  if (raw.includes("@")) {
    const c = await db.customer.findUnique({ where: { email: raw.toLowerCase() } });
    id = c && !c.anonymizedAt ? c.id : null;
  } else if (digits.length >= 9) {
    // 9 derniers chiffres : « 06 12… » et « +33 6 12… » se retrouvent. Deux clients au même numéro : ambigu.
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE "anonymizedAt" IS NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = ${digits.slice(-9)} LIMIT 2`;
    id = rows.length === 1 ? rows[0]!.id : null;
  }
  if (!id) return { error: "Aucune carte ne correspond (n° de carte, e-mail ou téléphone)." };
  redirect(`/admin/fidelite/carte/${await ensureCardNumber(id)}`);
}

const Purchase = z.object({ number: z.string().regex(/^\d{12}$/), amountCents: z.number().int().min(1, "Montant invalide").max(MAX_PURCHASE_CENTS, "Montant trop élevé (1 000 € maximum)") });

/** Achat payé au restaurant (sur place, à emporter au comptoir) : points crédités sur le montant. */
export async function creditPurchaseAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("orders.payment");
  const parsed = Purchase.safeParse({ number: String(form.get("number")), amountCents: parseEuros(String(form.get("amount") ?? "")) ?? 0 });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Montant invalide." };
  const settings = (await readConfig()).loyalty;
  if (!settings.enabled) return { error: "La carte de fidélité est désactivée (Fidélité → Réglages)." };
  const c = await customerByCard(parsed.data.number);
  if (!c) return { error: "Carte inconnue." };
  const points = pointsFor(parsed.data.amountCents, settings.pointsPerEuro);
  if (points <= 0) return { error: "Montant trop faible pour gagner des points." };
  const ticket = String(form.get("ticket") ?? "").trim().slice(0, 40);
  const note = `Achat au restaurant ${euros(parsed.data.amountCents)}${ticket ? ` (ticket ${ticket})` : ""}`;
  const balance = await db.$transaction(async (tx) => {
    await lockCustomer(tx, c.id);
    await tx.loyaltyTransaction.create({ data: { customerId: c.id, kind: "EARN", points, note, createdById: staff.user.id } });
    return balanceOf(c.id, tx);
  });
  await logAction(staff, "loyalty.in_store_purchase", "Customer", c.id, null, { amountCents: parsed.data.amountCents, points, ticket });
  revalidatePath(`/admin/fidelite/carte/${parsed.data.number}`);
  return { ok: `+${points} point(s) pour ${c.firstName || "le client"}. Nouveau solde : ${balance} point(s).` };
}

/** Récompense utilisée au comptoir : points retirés (la remise / le produit est donné par la caisse). */
export async function redeemInStoreAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("orders.payment");
  const number = String(form.get("number"));
  const c = await customerByCard(number);
  if (!c) return { error: "Carte inconnue." };
  const reward = await db.loyaltyReward.findFirst({ where: { id: String(form.get("rewardId")), active: true } });
  if (!reward) return { error: "Récompense inconnue." };
  const res = await db.$transaction(async (tx) => {
    await lockCustomer(tx, c.id);
    const balance = await balanceOf(c.id, tx);
    if (balance < reward.pointsCost) return { error: `Solde insuffisant : ${balance} point(s), il en faut ${reward.pointsCost}.` };
    await tx.loyaltyTransaction.create({ data: { customerId: c.id, kind: "REDEEM", points: -reward.pointsCost, rewardId: reward.id, note: `${reward.name} — au restaurant`, createdById: staff.user.id } });
    return { balance: balance - reward.pointsCost };
  });
  if ("error" in res) return { error: res.error };
  await logAction(staff, "loyalty.in_store_redeem", "Customer", c.id, null, { reward: reward.name, points: reward.pointsCost });
  revalidatePath(`/admin/fidelite/carte/${number}`);
  return { ok: `« ${reward.name} » utilisée : à appliquer en caisse. Nouveau solde : ${res.balance} point(s).` };
}

const NewCard = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(60),
  lastName: z.string().trim().max(60),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 .()-]{8,20}$/, "Téléphone invalide")]),
  email: z.string().trim().toLowerCase().email("E-mail requis (le client pourra ensuite créer son mot de passe sur le site)").max(160),
});

/** Nouvelle carte pour un client du restaurant (sans compte en ligne : il pourra l'activer avec son e-mail). */
export async function createCardAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("orders.payment");
  const parsed = NewCard.safeParse({ firstName: form.get("firstName"), lastName: form.get("lastName") ?? "", phone: form.get("phone") ?? "", email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const d = parsed.data;
  const existing = await db.customer.findUnique({ where: { email: d.email } });
  if (existing?.anonymizedAt) return { error: "Ce client a demandé la suppression de ses données." };
  const customer = existing ?? await db.customer.create({ data: { email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone } });
  const number = await ensureCardNumber(customer.id);
  await logAction(staff, existing ? "loyalty.card_existing" : "loyalty.card_created", "Customer", customer.id, null, { number });
  redirect(`/admin/fidelite/carte/${number}?${existing ? "existant" : "nouvelle"}=1`);
}
