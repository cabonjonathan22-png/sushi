/**
 * Allergènes de la carte, établis d'après les recettes classiques de chaque plat
 * (règlement UE 1169/2011, 14 allergènes). À FAIRE VALIDER par le restaurant avec
 * ses fiches techniques et les étiquettes de ses fournisseurs (sauces, panures…).
 *
 * Usage : npm run allergens:standard [-- --force]
 * Sans --force, seuls les produits sans allergènes renseignés sont complétés
 * (une saisie faite dans l'administration n'est jamais écrasée).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Briques de recettes
const RICE_ROLL = ["SESAME"]; // California / inside-out : sésame en enrobage
const SOY_SAUCE = ["SOY", "GLUTEN"]; // sauce soja, sauce yakitori, teriyaki
const TEMPURA = ["GLUTEN", "EGGS"]; // pâte à tempura, panure, oignons frits, poulet frit
const MAYO = ["EGGS", "MUSTARD"]; // mayonnaise, mayonnaise épicée
const RANCH = ["MILK", "EGGS"];
const CHEESE = ["MILK"];

const A: Record<string, string[]> = {
  // Boissons
  "biere-asahi": ["GLUTEN"],
  "iki-beer": ["GLUTEN"],
  "vin-du-luberon": ["SULPHITES"],
  "vins-de-pays": ["SULPHITES"],
  // Entrées
  "edamame": ["SOY"],
  "gyozas-crevettes-frit-ou-vapeur": ["GLUTEN", "CRUSTACEANS", "SOY", "SESAME"],
  "gyozas-poulet-frit-ou-vapeur": ["GLUTEN", "SOY", "SESAME"],
  "les-petits-tartares": ["FISH", "CRUSTACEANS", "SESAME", ...SOY_SAUCE, ...TEMPURA],
  "nems-poulet-x4": ["GLUTEN", "EGGS", "FISH", "SOY"],
  "rouleaux-de-printemps-x2": ["PEANUTS", "FISH", "CRUSTACEANS", ...SOY_SAUCE],
  "salade-de-chou": ["SESAME", "SOY", "EGGS"],
  "salade-d-algues-wakame": ["SESAME", "SOY"],
  "soupe-miso-avec-tofu": ["SOY", "FISH"],
  "soupe-miso-sans-tofu": ["SOY", "FISH"],
  "takoyaki-x6": ["MOLLUSCS", "FISH", ...TEMPURA, ...SOY_SAUCE, ...RANCH],
  "tempura-crevette-x5": ["CRUSTACEANS", ...TEMPURA],
  // Petits plus
  "sauce-soja-salee": SOY_SAUCE,
  "sauce-soja-sucree": SOY_SAUCE,
  "wasabi": ["MUSTARD"],
  // California rolls
  "cali-6-pieces-avocat-cheese": [...CHEESE, ...RICE_ROLL],
  "cali-6-pieces-avocat-crevette-menthe": ["CRUSTACEANS", ...RICE_ROLL],
  "cali-6-pieces-concombre-cheese": [...CHEESE, ...RICE_ROLL],
  "cali-6-pieces-crevette-tempura-avocat": ["CRUSTACEANS", ...TEMPURA, ...RICE_ROLL],
  "cali-6-pieces-poulet-frit-avocat-cheese": [...TEMPURA, ...CHEESE, ...RICE_ROLL],
  "cali-6-pieces-poulet-parmesan-roquette": [...TEMPURA, ...CHEESE, ...RANCH, ...RICE_ROLL],
  "cali-6-pieces-saumon-avocat": ["FISH", ...RICE_ROLL],
  "cali-6-pieces-saumon-cheese-menthe": ["FISH", ...CHEESE, ...RICE_ROLL],
  "cali-6-pieces-thon-avocat": ["FISH", ...RICE_ROLL],
  "cali-6-pieces-thon-cuit-avocat-mayonnaise": ["FISH", ...MAYO, ...RICE_ROLL],
  "cali-6-pieces-vegetarien": RICE_ROLL,
  // Chirashi (riz vinaigré, sésame)
  "chirashi-duo": ["FISH", "SESAME"],
  "chirashi-saumon": ["FISH", "SESAME"],
  "chirashi-saumon-avocat": ["FISH", "SESAME"],
  "chirashi-saumon-avocat-cheese": ["FISH", "SESAME", ...CHEESE],
  "chirashi-thon": ["FISH", "SESAME"],
  "chirashi-thon-avocat": ["FISH", "SESAME"],
  // Créations
  "creations-kyoto": ["FISH", ...TEMPURA, ...SOY_SAUCE, ...CHEESE, ...RICE_ROLL],
  "creations-miyagi": ["CRUSTACEANS", ...TEMPURA, ...RICE_ROLL],
  "creations-nigata": ["FISH", ...SOY_SAUCE, "SESAME"], // œufs de saumon, sauce yuzu (ponzu), shichimi
  "creations-oita": ["FISH", "CRUSTACEANS", ...TEMPURA, ...MAYO, ...RICE_ROLL],
  "creations-okayama": ["CRUSTACEANS", ...TEMPURA, ...CHEESE, ...RICE_ROLL],
  "creations-osaka": [...TEMPURA, ...RANCH, ...RICE_ROLL],
  "creations-saitama": ["FISH", ...SOY_SAUCE, "SESAME"],
  // Desserts
  "boules-coco-3-pcs": ["EGGS", "MILK"],
  "cheesecake-yuzu": ["MILK", "EGGS", "GLUTEN"],
  "mochis-glaces-2-pcs": ["MILK", "EGGS"],
  "yaourt-choco-gourmand": ["MILK", "GLUTEN", "NUTS", "SOY"], // spéculoos, pâte à tartiner noisette
  "yaourt-passion-miel": ["MILK", "GLUTEN"], // avoine
  // Makis
  "maki-6-pieces-avocat-cheese": CHEESE,
  "maki-6-pieces-avocat-crevette": ["CRUSTACEANS"],
  "maki-6-pieces-saumon": ["FISH"],
  "maki-6-pieces-saumon-avocat": ["FISH"],
  "maki-6-pieces-saumon-cheese": ["FISH", ...CHEESE],
  "maki-6-pieces-thon": ["FISH"],
  "maki-6-pieces-thon-cuit-cheese-ciboulette": ["FISH", ...CHEESE],
  // Plateaux (union des pièces)
  "all-saumon-10-pieces": ["FISH"],
  "california-dreamer-12-pieces": ["FISH", ...CHEESE, ...RICE_ROLL],
  "i-love-california-24-pieces": ["FISH", "CRUSTACEANS", ...MAYO, ...TEMPURA, ...RICE_ROLL],
  "kiyo-box-36-pieces": ["FISH", ...CHEESE, ...TEMPURA, ...RICE_ROLL],
  "kyio-box-xxl": ["FISH", "CRUSTACEANS", ...CHEESE, ...TEMPURA, ...RANCH, ...MAYO, ...RICE_ROLL],
  "original-box-22-pieces": ["FISH", ...CHEESE, ...TEMPURA, ...MAYO, ...RICE_ROLL],
  "rolls-box-18-pieces": [...TEMPURA, ...CHEESE, ...RANCH, ...RICE_ROLL],
  "sashimi-face-to-face-8-pieces": ["FISH"],
  "saumon-for-ever-18-pieces": ["FISH", ...CHEESE, ...RICE_ROLL],
  "sushi-mix-6-pieces": ["FISH", "CRUSTACEANS"],
  "veggie-mix-18-pieces": [...CHEESE, ...RICE_ROLL],
  "yaki-et-friends-24-pieces": ["FISH", ...CHEESE, ...SOY_SAUCE, ...TEMPURA, ...RANCH, ...RICE_ROLL],
  "yakitori-lover-6-pieces": ["FISH", ...CHEESE, ...SOY_SAUCE, "SESAME"],
  // Plats chauds
  "brochettes-boeuf-fromage": [...CHEESE, ...SOY_SAUCE, "SESAME"],
  "brochettes-poulet-caramelise": [...SOY_SAUCE, "SESAME"],
  "brochettes-poulet-frit": [...TEMPURA, ...SOY_SAUCE, "SESAME"],
  "brochettes-saumon": ["FISH", ...SOY_SAUCE, "SESAME"],
  "nouilles-au-choix": ["EGGS", "FISH", "CRUSTACEANS", ...SOY_SAUCE, ...TEMPURA, "SESAME"],
  "poulet-katsu": [...TEMPURA, ...SOY_SAUCE, "SESAME"],
  "ramen-au-choix": ["EGGS", "FISH", "CRUSTACEANS", ...SOY_SAUCE, ...TEMPURA, "SESAME"],
  // Poké (edamame, sauce soja, sésame)
  "poke-chicken-frit": [...TEMPURA, ...SOY_SAUCE, "SESAME"],
  "poke-daurade": ["FISH", ...SOY_SAUCE, "SESAME"],
  "poke-saumon": ["FISH", ...SOY_SAUCE, "SESAME"],
  "poke-tataki-saumon": ["FISH", ...SOY_SAUCE, "SESAME"],
  "poke-tataki-thon": ["FISH", ...SOY_SAUCE, "SESAME"],
  "poke-thon": ["FISH", ...SOY_SAUCE, "SESAME"],
  "poke-veggie": [...SOY_SAUCE, "SESAME"],
  // Rolls
  "rolls-6-pieces-saumon-avocat-cheese": ["FISH", ...CHEESE, ...RICE_ROLL],
  "rolls-6-pieces-saumon-cheese": ["FISH", ...CHEESE, ...RICE_ROLL],
  "rolls-6-pieces-saumon-flambee-cheese": ["FISH", ...CHEESE, ...RICE_ROLL],
  "rolls-6-pieces-white-thon-cuit-ciboulette": ["FISH", ...RICE_ROLL],
  "rolls-6-pieces-white-saumon-cheese": ["FISH", ...CHEESE, ...RICE_ROLL],
  "box-saint-valentin-precommande-pour-le-14-fevrier": ["FISH", ...CHEESE, ...RICE_ROLL],
  // Sashimi
  "sashimi-6-pieces-daurade": ["FISH"],
  "sashimi-6-pieces-saumon": ["FISH"],
  "sashimi-6-pieces-thon": ["FISH"],
  // Spring rolls (galette de riz)
  "spring-roll-6-pieces-concombre-cheese": CHEESE,
  "spring-roll-6-pieces-crevettes-tempura": ["CRUSTACEANS", ...TEMPURA],
  "spring-roll-6-pieces-poulet-frit-parmesan": [...TEMPURA, ...CHEESE],
  "spring-roll-6-pieces-saumon-avocat": ["FISH"],
  "spring-roll-6-pieces-saumon-avocat-cheese": ["FISH", ...CHEESE],
  "spring-roll-6-pieces-thon-avocat": ["FISH"],
  "spring-roll-6-pieces-thon-epice-oignons-frits": ["FISH", ...TEMPURA, ...MAYO],
  "spring-rolls-6-pieces-crevette-avocat-menthe": ["CRUSTACEANS"],
  // Sushis
  "sushi-crevette": ["CRUSTACEANS"],
  "sushi-daurade": ["FISH"],
  "sushi-saumon": ["FISH"],
  "sushi-saumon-cheese": ["FISH", ...CHEESE],
  "sushi-tataki-de-saumon": ["FISH"],
  "sushi-thon": ["FISH"],
  "sushi-thon-epice": ["FISH", ...TEMPURA, ...MAYO],
  // Tartares (riz vinaigré, sésame, sauce façon Kiyo à base de soja)
  "crevettes-avocat-mangue": ["CRUSTACEANS", "SESAME", ...SOY_SAUCE],
  "tartare-daurade-avocat-mangue-sauce-yuzu": ["FISH", "SESAME", ...SOY_SAUCE],
  "tartare-saumon-avocat-mangue": ["FISH", "SESAME", ...SOY_SAUCE],
  "tartare-thon-avocat-oignons-frits": ["FISH", "SESAME", ...SOY_SAUCE, ...TEMPURA],
};

/** Produits vérifiés sans aucun des 14 allergènes (eaux, sodas, jus, riz nature…). */
const NONE = new Set([
  "coca-coca-zero-cherry", "eau-plate-1l", "eau-plate-50cl", "eau-petillante-0-50cl", "eau-petillante-0-75cl", "fuze-tea",
  "ginger-beer-sans-alcool", "jus-litchie", "jus-pomme", "jus-mangue", "orangina", "ramune-limonade-japonaise",
  "bol-de-riz-vinaigre", "gingembre", "paire-de-baguettes", "salade-de-fruits", "spring-rolls-6-pieces-avocat-mangue",
]);

const ORDER = ["NONE", "GLUTEN", "CRUSTACEANS", "EGGS", "FISH", "PEANUTS", "SOY", "MILK", "NUTS", "CELERY", "MUSTARD", "SESAME", "SULPHITES", "LUPIN", "MOLLUSCS"];

async function main() {
  const force = process.argv.includes("--force");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const products = await db.product.findMany({ where: { archived: false }, select: { id: true, slug: true, allergens: true } });
  let updated = 0;
  const unknown: string[] = [];
  for (const p of products) {
    const list = A[p.slug] ?? (NONE.has(p.slug) ? ["NONE"] : null);
    if (list === null) { unknown.push(p.slug); continue; }
    if (p.allergens.length && !force) continue;
    const allergens = ORDER.filter((c) => list.includes(c));
    await db.product.update({ where: { id: p.id }, data: { allergens } });
    updated++;
  }
  console.log(`${updated} produit(s) mis à jour.`);
  if (unknown.length) console.log(`Non reconnus (à saisir dans l'administration) : ${unknown.join(", ")}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
