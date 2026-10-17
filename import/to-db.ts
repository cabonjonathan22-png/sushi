/**
 * import/data.json → base de données.
 *
 *   npm run import:db            # insère ce qui manque, ne touche à rien d'existant
 *   npm run import:db -- --update   # met aussi à jour le catalogue existant depuis data.json
 *
 * Relançable sans doublon : tout est rapproché par identifiant WordPress (wpId),
 * slug de restaurant ou empreinte d'image.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/lib/db.ts";
import { putFile } from "../src/lib/storage.ts";
import { DataJson } from "./schema.ts";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const UPDATE = process.argv.includes("--update");
const log = (...m: unknown[]) => console.log("•", ...m);

const BADGE_MAP: Record<string, string> = { vegetarien: "VEGETARIAN", vegan: "VEGAN", epice: "SPICY", nouveau: "NEW" };

async function main() {
  const data = DataJson.parse(JSON.parse(await readFile(path.join(ICI, "data.json"), "utf8")));
  log(`data.json du ${data.meta.genereLe} : ${data.produits.length} produits`);

  // 1. Images → stockage + table Image ------------------------------------------------------
  const imageIds = new Map<string, string>(); // id data.json → id base
  for (const img of data.images) {
    const existing = await db.image.findUnique({ where: { hash: img.id } });
    if (existing) {
      imageIds.set(img.id, existing.id);
      continue;
    }
    const files: Record<string, string> = {};
    for (const [w, nom] of Object.entries(img.fichiers)) {
      const buf = await readFile(path.join(ICI, "images", nom));
      const key = `products/${nom}`;
      await putFile(key, buf, "image/webp");
      files[w] = key;
    }
    const created = await db.image.create({
      data: { hash: img.id, originalName: img.nomOrigine, width: img.largeur, height: img.hauteur, files },
    });
    imageIds.set(img.id, created.id);
  }
  log(`${imageIds.size} images en base`);
  const imageRef = (id: string | null) => (id ? imageIds.get(id) ?? null : null);

  // 2. Réglages du site et textes de l'accueil -----------------------------------------------
  const settings = await db.siteSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    await db.siteSettings.create({
      data: {
        id: 1,
        brandName: data.restaurant.nom,
        content: {
          heroTitle: data.pageAccueil.titre || "Cuisine japonaise",
          heroTagline: data.pageAccueil.accroche,
          intro: data.pageAccueil.presentation,
          commitment: data.pageAccueil.engagement,
          heroImageId: imageRef(data.pageAccueil.imageIds.at(-1) ?? null),
        },
      },
    });
    log("Réglages du site créés");
  }

  // 3. Restaurant, horaires, zones, paiements ------------------------------------------------
  const r = data.restaurant;
  let restaurant = await db.restaurant.findUnique({ where: { slug: r.slug } });
  if (!restaurant) {
    restaurant = await db.restaurant.create({
      data: {
        slug: r.slug,
        name: r.nom,
        street: r.adresse.rue,
        postalCode: r.adresse.codePostal,
        city: r.adresse.ville,
        phones: r.telephones,
        mapsUrl: r.lienGoogleMaps,
        description: data.pageAccueil.presentation,
        dineInEnabled: r.services.surPlace,
        pickupEnabled: r.services.retrait,
        deliveryEnabled: r.services.livraison,
        openingHours: {
          create: r.horaires.flatMap((h) =>
            h.plages.map((p) => ({ weekday: h.jour, opens: p.debut, closes: p.fin, period: p.debut < "16:00" ? ("LUNCH" as const) : ("DINNER" as const) })),
          ),
        },
        // Règle appliquée aujourd'hui par WooCommerce : livraison gratuite, 50 € minimum.
        // Le texte de l'accueil annonçait 20/35 € et 20/40 € : à confirmer, modifiable dans le back-office.
        zones: {
          create: r.zones.map((z, i) => ({
            name: z.nom,
            sortOrder: i,
            minLunchCents: 5000,
            minDinnerCents: 5000,
            feeCents: z.fraisLivraison,
            freeFromCents: z.seuilLivraisonGratuite,
            etaMinutes: 30 + i * 10,
            areas: { create: z.communes.map((c) => ({ postalCode: c.codePostal, city: c.nom, inseeCode: c.codeInsee })) },
          })),
        },
        paymentMethods: {
          create: [
            { method: "ONLINE_CARD" as const },
            { method: "CASH" as const },
            { method: "CARD_TERMINAL" as const },
          ],
        },
        printers: {
          create: [{ name: "Navigateur (comptoir)", method: "BROWSER", paperWidth: "MM80", deviceToken: crypto.randomUUID().replace(/-/g, "") }],
        },
      },
    });
    log(`Restaurant « ${restaurant.name} » créé`);
  }

  // 4. Catégories -----------------------------------------------------------------------------
  const catIds = new Map<string, string>(); // slug data.json → id
  for (const c of data.categories) {
    const fields = {
      slug: c.slug, name: c.nom, sortOrder: c.ordre, visible: c.visible,
      kind: c.type === "PETITS_PLUS" ? ("EXTRAS" as const) : ("STANDARD" as const), legacyUrl: c.ancienneUrl,
    };
    const existing = await db.category.findUnique({ where: { wpId: c.wpId } });
    const saved = existing
      ? UPDATE ? await db.category.update({ where: { id: existing.id }, data: fields }) : existing
      : await db.category.create({ data: { ...fields, wpId: c.wpId } });
    catIds.set(c.slug, saved.id);
  }
  log(`${catIds.size} catégories`);

  // 5. Produits, variantes, liens catégories, disponibilité restaurant ------------------------
  let crees = 0;
  let maj = 0;
  for (const p of data.produits) {
    const fields = {
      slug: p.slug,
      name: p.nom,
      shortDescription: p.descriptionCourte,
      description: p.description,
      priceCents: p.prix,
      vatRate: Math.round(p.tauxTva * 100),
      imageId: imageRef(p.imageId),
      badges: p.badges.map((b) => BADGE_MAP[b.slug] ?? b.slug.toUpperCase()),
      allergens: p.allergenes,
      isAlcohol: p.alcool,
      active: p.visibleSurMenu,
      legacySlug: p.ancienSlug,
      legacyUrl: p.ancienneUrl,
    };
    const existing = await db.product.findUnique({ where: { wpId: p.wpId } });
    if (existing && !UPDATE) continue;

    await db.$transaction(async (tx) => {
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data: fields })
        : await tx.product.create({ data: { ...fields, wpId: p.wpId } });

      await tx.productCategory.deleteMany({ where: { productId: product.id } });
      await tx.productCategory.createMany({
        data: p.categories
          .filter((c) => catIds.has(c.slug))
          .map((c) => ({ productId: product.id, categoryId: catIds.get(c.slug)!, sortOrder: c.ordre })),
      });

      for (const [i, v] of p.variantes.entries()) {
        const vFields = {
          label: Object.values(v.attributs).join(" · "),
          attributes: v.attributs,
          priceCents: v.prix,
          imageId: imageRef(v.imageId),
          sortOrder: i,
        };
        await tx.productVariant.upsert({
          where: { wpId: v.wpId },
          create: { ...vFields, wpId: v.wpId, productId: product.id },
          update: vFields,
        });
        if (v.enRupture) {
          const variant = await tx.productVariant.findUniqueOrThrow({ where: { wpId: v.wpId } });
          await tx.restaurantVariant.upsert({
            where: { restaurantId_variantId: { restaurantId: restaurant.id, variantId: variant.id } },
            create: { restaurantId: restaurant.id, variantId: variant.id, outOfStock: true },
            update: { outOfStock: true },
          });
        }
      }

      // La rupture est propre à chaque restaurant.
      await tx.restaurantProduct.upsert({
        where: { restaurantId_productId: { restaurantId: restaurant.id, productId: product.id } },
        create: { restaurantId: restaurant.id, productId: product.id, outOfStock: p.enRupture },
        update: { outOfStock: p.enRupture },
      });
    });
    if (existing) maj++;
    else crees++;
  }
  log(`Produits : ${crees} créés, ${maj} mis à jour, ${data.produits.length - crees - maj} inchangés`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✖ Import en base interrompu :", e);
  await db.$disconnect();
  process.exit(1);
});
