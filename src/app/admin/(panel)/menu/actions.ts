"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize, logAction } from "@/lib/admin";
import { ALLERGENS, NO_ALLERGEN } from "@/lib/catalog-constants";
import { getConfig, readConfig } from "@/lib/config";
import { ConfigSchema } from "@/lib/config-schema";
import { canAccessRestaurant } from "@/lib/permissions";
import { db } from "@/lib/db";
import { storeProductImage } from "@/lib/images";
import { parseEuros } from "@/lib/money";
import { slugify } from "@/lib/text-utils";

type Result = { ok?: string; error?: string } | undefined;

const refresh = () => {
  revalidatePath("/admin/menu");
  revalidatePath("/commander", "layout");
};

// ───────────── Ruptures et disponibilité par restaurant (1 clic) ─────────────

export async function toggleStockAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId"));
  const productId = String(form.get("productId"));
  const staff = await authorize("stock.toggle", restaurantId);
  const out = form.get("value") === "1";
  await db.restaurantProduct.upsert({
    where: { restaurantId_productId: { restaurantId, productId } },
    create: { restaurantId, productId, outOfStock: out },
    update: { outOfStock: out },
  });
  await logAction(staff, out ? "product.out_of_stock" : "product.back_in_stock", "Product", productId, restaurantId);
  refresh();
}

export async function toggleVariantStockAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId"));
  const variantId = String(form.get("variantId"));
  const staff = await authorize("stock.toggle", restaurantId);
  const out = form.get("value") === "1";
  await db.restaurantVariant.upsert({
    where: { restaurantId_variantId: { restaurantId, variantId } },
    create: { restaurantId, variantId, outOfStock: out },
    update: { outOfStock: out },
  });
  await logAction(staff, out ? "variant.out_of_stock" : "variant.back_in_stock", "ProductVariant", variantId, restaurantId);
  refresh();
}

export async function toggleRestaurantActiveAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId"));
  const productId = String(form.get("productId"));
  const staff = await authorize("menu.restaurant", restaurantId);
  const active = form.get("value") === "1";
  await db.restaurantProduct.upsert({
    where: { restaurantId_productId: { restaurantId, productId } },
    create: { restaurantId, productId, active },
    update: { active },
  });
  await logAction(staff, active ? "product.enable" : "product.disable", "Product", productId, restaurantId);
  refresh();
}

/** Catégorie affichée ou masquée dans un restaurant. */
export async function toggleCategoryRestaurantAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId"));
  const categoryId = String(form.get("categoryId"));
  const staff = await authorize("menu.restaurant", restaurantId);
  const visible = form.get("value") === "1";
  await db.restaurantCategory.upsert({
    where: { restaurantId_categoryId: { restaurantId, categoryId } },
    create: { restaurantId, categoryId, visible },
    update: { visible },
  });
  await logAction(staff, visible ? "category.show_restaurant" : "category.hide_restaurant", "Category", categoryId, restaurantId);
  refresh();
}

/** Prix propre à un restaurant (vide = prix du catalogue). */
export async function saveOverrideAction(_: Result, form: FormData): Promise<Result> {
  const restaurantId = String(form.get("restaurantId"));
  const productId = String(form.get("productId"));
  const staff = await authorize("menu.restaurant", restaurantId);
  const raw = String(form.get("price") ?? "").trim();
  const price = raw ? parseEuros(raw) : null;
  if (raw && price === null) return { error: "Prix invalide." };
  await db.restaurantProduct.upsert({
    where: { restaurantId_productId: { restaurantId, productId } },
    create: { restaurantId, productId, priceCents: price },
    update: { priceCents: price },
  });
  await logAction(staff, "product.price_override", "Product", productId, restaurantId, { price });
  refresh();
  return { ok: price === null ? "Prix du catalogue rétabli." : "Prix du restaurant enregistré." };
}

// ───────────── Ordre (glisser-déposer) ─────────────

export async function reorderCategoriesAction(ids: string[]) {
  const staff = await authorize("menu.edit");
  await db.$transaction(ids.slice(0, 200).map((id, i) => db.category.update({ where: { id }, data: { sortOrder: i } })));
  await logAction(staff, "category.reorder", "Category", "", null, { ids });
  refresh();
}

export async function reorderProductsAction(categoryId: string, productIds: string[]) {
  const staff = await authorize("menu.edit");
  await db.$transaction(
    productIds.slice(0, 500).map((productId, i) =>
      db.productCategory.update({ where: { productId_categoryId: { productId, categoryId } }, data: { sortOrder: i } })),
  );
  await logAction(staff, "product.reorder", "Category", categoryId, null);
  refresh();
}

// ───────────── Catégories ─────────────

const CategoryInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nom requis").max(60),
  description: z.string().trim().max(300),
  visible: z.boolean(),
  kind: z.enum(["STANDARD", "EXTRAS"]),
});

export async function saveCategoryAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("menu.edit");
  const parsed = CategoryInput.safeParse({
    id: form.get("id") || undefined,
    name: form.get("name"),
    description: form.get("description") ?? "",
    visible: form.get("visible") === "on",
    kind: form.get("kind") === "EXTRAS" ? "EXTRAS" : "STANDARD",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { id, ...data } = parsed.data;
  if (id) {
    await db.category.update({ where: { id }, data });
  } else {
    let slug = slugify(data.name) || "categorie";
    for (let i = 2; await db.category.findUnique({ where: { slug } }); i++) slug = `${slugify(data.name)}-${i}`;
    const max = await db.category.aggregate({ _max: { sortOrder: true } });
    const c = await db.category.create({ data: { ...data, slug, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await logAction(staff, "category.create", "Category", c.id, null, data);
    refresh();
    redirect("/admin/menu");
  }
  await logAction(staff, "category.update", "Category", id, null, data);
  refresh();
  return { ok: "Catégorie enregistrée." };
}

export async function deleteCategoryAction(form: FormData) {
  const staff = await authorize("menu.edit");
  const id = String(form.get("id"));
  const count = await db.productCategory.count({ where: { categoryId: id } });
  if (count > 0) throw new Error("Catégorie non vide : déplacez d'abord ses produits.");
  await db.category.delete({ where: { id } });
  await logAction(staff, "category.delete", "Category", id, null);
  refresh();
  redirect("/admin/menu");
}

// ───────────── Produits ─────────────

const VariantInput = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Nom de variante requis").max(80),
  price: z.string(),
  active: z.boolean(),
});
const OptionInput = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), price: z.string(), active: z.boolean() });
const GroupInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nom du groupe d'options requis").max(80),
  minSelect: z.number().int().min(0).max(20),
  maxSelect: z.number().int().min(1).max(20),
  options: z.array(OptionInput).min(1, "Chaque groupe doit avoir au moins une option.").max(40),
});

const ProductInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nom requis").max(100),
  shortDescription: z.string().trim().max(400),
  description: z.string().trim().max(2000),
  price: z.string(),
  vatRate: z.coerce.number().int().min(0).max(3000),
  categoryIds: z.array(z.string()).min(1, "Choisissez au moins une catégorie."),
  allergens: z.array(z.string()).refine((a) => a.every((x) => x === NO_ALLERGEN || ALLERGENS.some((y) => y.code === x)), "Allergène inconnu")
    // « Aucun allergène » coché avec des allergènes : les allergènes l'emportent.
    .transform((a) => (a.some((x) => x !== NO_ALLERGEN) ? a.filter((x) => x !== NO_ALLERGEN) : a)),
  badges: z.array(z.string().max(30)).max(20),
  isAlcohol: z.boolean(),
  maxQuantity: z.string(),
  includedExtras: z.coerce.number().int().min(0, "Petits plus offerts invalides").max(50),
  availablePickup: z.boolean(),
  availableDelivery: z.boolean(),
  availableDineIn: z.boolean(),
  availableLunch: z.boolean(),
  availableDinner: z.boolean(),
  active: z.boolean(),
  variants: z.array(VariantInput).max(40),
  groups: z.array(GroupInput).max(10),
});

export async function saveProductAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("menu.edit");
  let json: { variants: unknown; groups: unknown };
  try {
    json = JSON.parse(String(form.get("structure") ?? '{"variants":[],"groups":[]}')) as typeof json;
  } catch {
    return { error: "Données de variantes illisibles." };
  }
  const parsed = ProductInput.safeParse({
    id: form.get("id") || undefined,
    name: form.get("name"),
    shortDescription: form.get("shortDescription") ?? "",
    description: form.get("description") ?? "",
    price: form.get("price") ?? "",
    vatRate: form.get("vatRate"),
    categoryIds: form.getAll("categoryIds").map(String),
    allergens: form.getAll("allergens").map(String),
    badges: form.getAll("badges").map(String),
    isAlcohol: form.get("isAlcohol") === "on",
    maxQuantity: String(form.get("maxQuantity") ?? ""),
    includedExtras: form.get("includedExtras") || 0,
    availablePickup: form.get("availablePickup") === "on",
    availableDelivery: form.get("availableDelivery") === "on",
    availableDineIn: form.get("availableDineIn") === "on",
    availableLunch: form.get("availableLunch") === "on",
    availableDinner: form.get("availableDinner") === "on",
    active: form.get("active") === "on",
    variants: json.variants,
    groups: json.groups,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const p = parsed.data;
  // Badges et taux de TVA autorisés : ceux de la Configuration.
  const config = await getConfig();
  if (!config.catalog.vatRates.some((v) => v.value === p.vatRate)) return { error: "Taux de TVA invalide." };
  if (p.badges.some((b) => !config.catalog.badges.some((x) => x.code === b))) return { error: "Badge inconnu." };
  if (!p.availableLunch && !p.availableDinner) return { error: "Le produit doit être proposé le midi, le soir, ou les deux." };

  const priceCents = parseEuros(p.price);
  if (priceCents === null) return { error: "Prix invalide (ex. 12,90)." };
  const maxQuantity = p.maxQuantity.trim() ? Number(p.maxQuantity) : null;
  if (maxQuantity !== null && (!Number.isInteger(maxQuantity) || maxQuantity < 1)) return { error: "Quantité maximum invalide." };
  const variants = p.variants.map((v, i) => ({ ...v, priceCents: parseEuros(v.price), sortOrder: i }));
  if (variants.some((v) => v.priceCents === null)) return { error: "Prix de variante invalide." };
  for (const g of p.groups) {
    if (g.minSelect > g.maxSelect) return { error: `Groupe « ${g.name} » : minimum supérieur au maximum.` };
    if (g.options.some((o) => parseEuros(o.price || "0") === null)) return { error: `Groupe « ${g.name} » : prix d'option invalide.` };
  }

  // Photo : contrôlée, ré-encodée en WebP, recadrée en carré.
  let imageId: string | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      imageId = await storeProductImage(Buffer.from(await file.arrayBuffer()), file.name);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const removeImage = form.get("removeImage") === "on";

  const base = {
    name: p.name, shortDescription: p.shortDescription, description: p.description, priceCents, vatRate: p.vatRate,
    allergens: p.allergens, badges: p.badges, isAlcohol: p.isAlcohol, maxQuantity, includedExtras: p.includedExtras,
    availablePickup: p.availablePickup, availableDelivery: p.availableDelivery, availableDineIn: p.availableDineIn,
    availableLunch: p.availableLunch, availableDinner: p.availableDinner, active: p.active,
    ...(imageId ? { imageId } : removeImage ? { imageId: null } : {}),
  };

  const productId = await db.$transaction(async (tx) => {
    let id = p.id;
    if (id) {
      await tx.product.update({ where: { id }, data: base });
    } else {
      let slug = slugify(p.name) || "produit";
      for (let i = 2; await tx.product.findUnique({ where: { slug } }); i++) slug = `${slugify(p.name)}-${i}`;
      id = (await tx.product.create({ data: { ...base, slug } })).id;
    }

    // Catégories : on garde l'ordre existant, les nouvelles arrivent en fin de liste.
    const existingCats = await tx.productCategory.findMany({ where: { productId: id } });
    await tx.productCategory.deleteMany({ where: { productId: id, categoryId: { notIn: p.categoryIds } } });
    for (const categoryId of p.categoryIds.filter((c) => !existingCats.some((e) => e.categoryId === c))) {
      const max = await tx.productCategory.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
      await tx.productCategory.create({ data: { productId: id, categoryId, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    }

    // Variantes : mises à jour / créées / supprimées (les commandes passées gardent leur copie).
    const keepV = variants.filter((v) => v.id).map((v) => v.id!);
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keepV } } });
    for (const v of variants) {
      const data = { label: v.label, priceCents: v.priceCents!, active: v.active, sortOrder: v.sortOrder };
      if (v.id) await tx.productVariant.update({ where: { id: v.id }, data });
      else await tx.productVariant.create({ data: { ...data, productId: id } });
    }

    // Groupes d'options
    const keepG = p.groups.filter((g) => g.id).map((g) => g.id!);
    await tx.optionGroup.deleteMany({ where: { productId: id, id: { notIn: keepG } } });
    for (const [gi, g] of p.groups.entries()) {
      const gData = { name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi };
      const groupId = g.id ? (await tx.optionGroup.update({ where: { id: g.id }, data: gData })).id : (await tx.optionGroup.create({ data: { ...gData, productId: id } })).id;
      const keepO = g.options.filter((o) => o.id).map((o) => o.id!);
      await tx.option.deleteMany({ where: { groupId, id: { notIn: keepO } } });
      for (const [oi, o] of g.options.entries()) {
        const oData = { name: o.name, priceDeltaCents: parseEuros(o.price || "0")!, active: o.active, sortOrder: oi };
        if (o.id) await tx.option.update({ where: { id: o.id }, data: oData });
        else await tx.option.create({ data: { ...oData, groupId } });
      }
    }
    // Restaurants où le produit est proposé (seulement ceux que l'utilisateur gère).
    const scope = String(form.get("restaurantScope") ?? "").split(",").filter((r) => r && canAccessRestaurant(staff.actor, r));
    const chosen = new Set(form.getAll("restaurantIds").map(String));
    for (const restaurantId of scope) {
      await tx.restaurantProduct.upsert({
        where: { restaurantId_productId: { restaurantId, productId: id } },
        create: { restaurantId, productId: id, active: chosen.has(restaurantId) },
        update: { active: chosen.has(restaurantId) },
      });
    }
    return id;
  });

  await logAction(staff, p.id ? "product.update" : "product.create", "Product", productId, null, { name: p.name, price: priceCents });
  refresh();
  if (!p.id) redirect(`/admin/menu/produits/${productId}?ok=1`);
  return { ok: "Produit enregistré." };
}

/** Archiver = retirer du menu sans perdre l'historique (les commandes passées restent intactes). */
export async function archiveProductAction(form: FormData) {
  const staff = await authorize("menu.edit");
  const id = String(form.get("id"));
  const archived = form.get("value") === "1";
  await db.product.update({ where: { id }, data: { archived } });
  await logAction(staff, archived ? "product.archive" : "product.unarchive", "Product", id, null);
  refresh();
  redirect("/admin/menu");
}

// ───────────── Compléments à la commande (sauce soja, baguettes…) ─────────────

/**
 * Choix obligatoire des compléments à la fin de la commande, compléments offerts sur toute
 * commande et par palier de montant. Lignes « 40 = 2 » : à partir de 40 €, 2 offerts.
 */
export async function saveExtrasSettingsAction(_: Result, form: FormData): Promise<Result> {
  const staff = await authorize("menu.edit");
  const tiers: { fromCents: number; count: number }[] = [];
  for (const line of String(form.get("tiers") ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:€)?\s*[=:→>-]+\s*(\d{1,2})$/);
    const fromCents = m ? parseEuros(m[1]!) : null;
    if (!m || fromCents === null) return { error: `Palier illisible : « ${line} ». Écrivez par exemple « 40 = 2 » (dès 40 €, 2 compléments offerts).` };
    tiers.push({ fromCents, count: Number(m[2]) });
  }
  const current = await readConfig();
  const parsed = ConfigSchema.safeParse({
    ...current,
    extras: { askAtCheckout: form.get("askAtCheckout") === "on", freePerOrder: Number(form.get("freePerOrder") || 0), tiers: tiers.sort((a, b) => a.fromCents - b.fromCents) },
  });
  if (!parsed.success) return { error: `Réglage invalide : ${parsed.error.issues[0]?.message}` };
  await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, config: parsed.data }, update: { config: parsed.data } });
  await logAction(staff, "extras.settings", "SiteSettings", "1", null, parsed.data.extras);
  revalidatePath("/", "layout");
  refresh();
  return { ok: "Réglages des compléments enregistrés." };
}
