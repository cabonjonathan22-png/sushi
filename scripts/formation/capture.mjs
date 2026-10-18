// Captures annotées pour le guide de formation (instance de formation sur une COPIE de la base).
// Usage : node capture.mjs [filtre]   → shots/<nom>.jpg + shots/<nom>.json (cadres des repères)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const req = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = req("playwright-core");
const { TOTP, Secret } = req("otpauth");

const B = process.env.B ?? "http://localhost:3100";
const need = (k) => process.env[k] ?? (() => { throw new Error(`Variable ${k} manquante (voir README de ce dossier).`); })();
const ADMIN_EMAIL = need("ADMIN_EMAIL"), ADMIN_PASSWORD = need("ADMIN_PASSWORD"), ADMIN_TOTP = process.env.ADMIN_TOTP ?? "";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@yaoma-sushi.com", DEMO_PASSWORD = need("DEMO_PASSWORD");
const OUT = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[2] ?? "";
const warnings = [];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctxOpts = { locale: "fr-FR", timezoneId: "Europe/Paris" };
const noCookie = () => { try { localStorage.setItem("ys_cookie_notice", "1"); } catch {} };

/** Cadre d'un élément (coordonnées de la capture). */
async function rectOf(page, loc, full) {
  try {
    const el = loc.first();
    await el.waitFor({ state: "visible", timeout: 4000 });
    return await el.evaluate((e, full) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + (full ? scrollX : 0), y: r.top + (full ? scrollY : 0), w: r.width, h: r.height };
    }, full);
  } catch {
    return null;
  }
}

/** Capture + repères. marks : [locator, …] dans l'ordre des numéros de la légende. */
async function shot(page, name, marks = [], { full = false, clip } = {}) {
  if (ONLY && !name.includes(ONLY)) return;
  await page.waitForTimeout(350);
  // Pleine page : en-têtes et barres « collantes » remis dans le flux (sinon dessinés au milieu).
  if (full) await page.addStyleTag({ content: "header,.sticky{position:static!important}" });
  const boxes = [];
  for (const [i, m] of marks.entries()) {
    const r = await rectOf(page, m, full);
    if (!r) warnings.push(`${name} : repère ${i + 1} introuvable`);
    boxes.push(r);
  }
  const size = await page.evaluate((full) => ({ w: full ? document.documentElement.scrollWidth : innerWidth, h: full ? document.documentElement.scrollHeight : innerHeight }), full);
  const opts = { path: `${OUT}${name}.jpg`, type: "jpeg", quality: 82, fullPage: full };
  if (clip) opts.clip = clip;
  await page.screenshot(opts);
  const w = clip ? clip.width : size.w;
  const h = clip ? clip.height : size.h;
  const shift = clip ? { x: clip.x, y: clip.y } : { x: 0, y: 0 };
  writeFileSync(`${OUT}${name}.json`, JSON.stringify({ w, h, boxes: boxes.map((b) => b && { ...b, x: b.x - shift.x, y: b.y - shift.y }) }));
  console.log("✓", name);
}

// ---------------------------------------------------------------- Site client (ordinateur)
if (!process.env.ADMIN_ONLY) {
const desk = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 900 } });
await desk.addInitScript(noCookie);
const d = await desk.newPage();

await d.goto(B + "/", { waitUntil: "networkidle" });
await shot(d, "site-accueil", [
  d.getByRole("link", { name: "La carte" }).first(),
  d.locator("header select"),
  d.locator("header").getByRole("link", { name: "Commander", exact: true }),
  d.getByRole("link", { name: "Commander en ligne" }).first(),
  d.locator("main p.rounded-full").first(),
  d.locator("main .rounded-2xl.bg-white.shadow-xl").first(),
]);
await d.locator("#featured").scrollIntoViewIfNeeded();
await d.evaluate(() => scrollBy(0, -120));
await shot(d, "site-incontournables", [
  d.locator("#featured"),
  d.getByRole("link", { name: /Découvrir toute la carte/ }).first(),
  d.locator("#featured ~ div a, section:has(#featured) .grid a").first(),
]);
await d.locator("#how").scrollIntoViewIfNeeded();
await d.evaluate(() => scrollBy(0, -80));
await shot(d, "site-services", [d.locator("section:has(#how) a").first(), d.locator("section:has(#how) a").nth(1)]);

await d.goto(B + "/livraison/cadenet", { waitUntil: "networkidle" });
await shot(d, "site-commune", [
  d.locator("nav[aria-label=Breadcrumb]"),
  d.locator("h1"),
  d.locator("dl").first(),
  d.getByRole("link", { name: /Commander pour Cadenet/ }).first(),
]);

await d.goto(B + "/allergenes", { waitUntil: "networkidle" });
await shot(d, "site-allergenes", [d.locator("main ul").first(), d.locator("table").first()]);

// Menu + panier + validation (commande 1 : livraison à Cadenet, espèces)
async function fillCart(page, adds) {
  await page.goto(B + "/commander/cucuron", { waitUntil: "networkidle" });
  for (const [name, n] of adds) for (let i = 0; i < n; i++) { await page.getByRole("button", { name: `Ajouter ${name}`, exact: true }).click(); await page.waitForTimeout(150); }
}
await d.goto(B + "/commander/cucuron", { waitUntil: "networkidle" });
await d.evaluate(() => localStorage.clear());
await d.addInitScript(noCookie);
await fillCart(d, [["Poké Saumon", 2], ["Chirashi Saumon Avocat", 1], ["Edamame", 1]]);
await d.evaluate(() => scrollTo(0, 0));
await shot(d, "site-carte", [
  d.locator("#menu-search"),
  d.locator("[aria-label='Catégories']"),
  d.getByRole("button", { name: "Ajouter Salade de chou", exact: true }),
  d.locator("aside"),
]);
await d.getByRole("button", { name: /Choisir Gyozas Poulet/ }).click();
await d.waitForTimeout(500);
await shot(d, "site-fiche-produit", [
  d.locator("dialog h2"),
  d.locator("dialog fieldset").first(),
  d.locator("dialog").getByText("Allergènes", { exact: false }).first(),
  d.locator("dialog").getByRole("button", { name: /Ajouter/ }).last(),
]);
await d.locator("dialog input[type=radio]").nth(3).check();
await d.locator("dialog").getByRole("button", { name: /Ajouter/ }).last().click();
await d.waitForTimeout(400);
await d.evaluate(() => scrollTo(0, 0));
await shot(d, "site-panier", [
  d.locator("aside li").first(),
  d.locator("aside").getByText(/petits plus/i).first(),
  d.locator("aside").getByText(/Total|Sous-total/).first(),
  d.locator("aside").getByRole("link", { name: /Valider ma commande/ }),
]);
await d.locator("aside").getByRole("link", { name: /Valider ma commande/ }).click();
await d.waitForURL(/valider/); await d.waitForTimeout(1200);
await d.getByRole("radio", { name: "Livraison" }).click();
await d.fill("#cp", "84160"); await d.waitForTimeout(400);
await d.selectOption("#city", "Cadenet").catch(() => {});
await d.fill("#street", "2 rue de la Mairie"); await d.waitForTimeout(300);
await d.keyboard.press("Escape");
await d.locator("section[aria-labelledby=s-slot] button").filter({ hasText: /^\s*\d\d:\d\d\s*$/ }).nth(4).click(); await d.waitForTimeout(300);
await d.fill("#fn", "Marie"); await d.fill("#ln", "Durand"); await d.fill("#ph", "06 12 34 56 78"); await d.fill("#em", "marie.durand@example.com");
await d.locator("section[aria-labelledby=s-pay]").getByText(/Espèces/).first().click();
await d.getByText("J'accepte les").locator("..").locator("input[type=checkbox]").check();
await d.waitForTimeout(1200);
await shot(d, "site-validation", [
  d.locator("section[aria-labelledby=s-mode]"),
  d.locator("section[aria-labelledby=s-slot]"),
  d.locator("section[aria-labelledby=s-contact]"),
  d.locator("section[aria-labelledby=s-pay]"),
  d.getByRole("button", { name: /Commander ·/ }),
], { full: true });
await d.getByRole("button", { name: /Commander ·/ }).click();
await d.waitForURL(/\/commande\//, { timeout: 20000 });
await d.waitForTimeout(800);
await shot(d, "site-suivi", [d.locator("h1"), d.locator("ol").first(), d.getByRole("heading", { name: "Détail" })]);

// Commande 2 : retrait, carte au comptoir, avec note
await fillCart(d, [["Poké Thon", 1], ["Sushi – Saumon", 2]]);
await d.locator("aside").getByRole("link", { name: /Valider ma commande/ }).click();
await d.waitForURL(/valider/); await d.waitForTimeout(1200);
await d.getByRole("radio", { name: /Retrait|À emporter/ }).first().click();
await d.locator("section[aria-labelledby=s-slot] button").filter({ hasText: /^\s*\d\d:\d\d\s*$/ }).nth(4).click(); await d.waitForTimeout(300);
await d.fill("#fn", "Paul"); await d.fill("#ln", "Martin"); await d.fill("#ph", "06 98 76 54 32"); await d.fill("#em", "paul.martin@example.com");
await d.fill("#notes", "Sans sésame s'il vous plaît").catch(() => {});
await d.locator("section[aria-labelledby=s-pay]").getByText(/Carte bancaire \(terminal\)|terminal/).first().click();
await d.getByText("J'accepte les").locator("..").locator("input[type=checkbox]").check();
await d.getByRole("button", { name: /Commander ·/ }).click();
await d.waitForURL(/\/commande\//, { timeout: 20000 });

// Commande 3 : retrait, espèces
await fillCart(d, [["Chirashi Saumon", 1], ["Edamame", 1]]);
await d.locator("aside").getByRole("link", { name: /Valider ma commande/ }).click();
await d.waitForURL(/valider/); await d.waitForTimeout(1200);
await d.getByRole("radio", { name: /Retrait|À emporter/ }).first().click();
await d.locator("section[aria-labelledby=s-slot] button").filter({ hasText: /^\s*\d\d:\d\d\s*$/ }).nth(4).click(); await d.waitForTimeout(300);
await d.fill("#fn", "Léa"); await d.fill("#ln", "Bernard"); await d.fill("#ph", "07 11 22 33 44"); await d.fill("#em", "lea.bernard@example.com");
await d.locator("section[aria-labelledby=s-pay]").getByText(/Espèces/).first().click();
await d.getByText("J'accepte les").locator("..").locator("input[type=checkbox]").check();
await d.getByRole("button", { name: /Commander ·/ }).click();
await d.waitForURL(/\/commande\//, { timeout: 20000 });

// Compte client de démonstration
await d.goto(B + "/compte", { waitUntil: "networkidle" });
await shot(d, "site-compte-connexion", [d.locator("form").first(), d.locator("form").nth(1)]);
await d.fill("#le", DEMO_EMAIL); await d.fill("#lp", DEMO_PASSWORD);
await d.locator("form").first().getByRole("button", { name: "Se connecter" }).click();
await d.waitForTimeout(2500);
await shot(d, "site-compte", [d.getByRole("heading", { name: "Mes commandes" }), d.getByRole("heading", { name: "Mes coordonnées" }), d.getByRole("heading", { name: "Mes données" })], { full: true });

// ---------------------------------------------------------------- Site client (téléphone)
const mob = await browser.newContext({ ...ctxOpts, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mob.addInitScript(noCookie);
const m = await mob.newPage();
await m.goto(B + "/", { waitUntil: "networkidle" });
await shot(m, "mobile-accueil", [m.getByRole("button", { name: "Ouvrir le menu" }), m.locator("header").getByRole("link", { name: "Commander", exact: true })]);
await m.getByRole("button", { name: "Ouvrir le menu" }).click();
await shot(m, "mobile-menu", [m.locator("#mobile-nav nav a").first(), m.locator("#mobile-nav select")]);
await m.goto(B + "/commander/cucuron", { waitUntil: "networkidle" });
await m.getByRole("button", { name: "Ajouter Poké Saumon", exact: true }).click();
await m.getByRole("button", { name: "Ajouter Edamame", exact: true }).click();
await m.waitForTimeout(500);
await shot(m, "mobile-carte", [m.locator("[aria-label='Catégories']"), m.getByRole("button", { name: /Voir le panier/ })]);

}
// ---------------------------------------------------------------- Back-office
const adm = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 900 } });
const a = await adm.newPage();
await a.goto(B + "/admin/connexion", { waitUntil: "networkidle" });
await shot(a, "admin-connexion", [a.locator("#email"), a.locator("#password"), a.getByRole("button", { name: "Se connecter" })]);
await a.fill("#email", ADMIN_EMAIL); await a.fill("#password", ADMIN_PASSWORD);
await a.getByRole("button", { name: "Se connecter" }).click();
await a.waitForURL(/code|admin/, { timeout: 20000 }); await a.waitForTimeout(800);
if (await a.locator("input[name=code]").count()) {
  await shot(a, "admin-code", [a.locator("input[name=code]"), a.locator("form button[type=submit]").first()]);
  await a.fill("input[name=code]", new TOTP({ secret: Secret.fromBase32(ADMIN_TOTP) }).generate());
  await a.locator("form button[type=submit]").first().click();
  await a.waitForURL((u) => !u.pathname.includes("connexion"), { timeout: 20000 });
}
await a.goto(B + "/admin", { waitUntil: "networkidle" });
await shot(a, "admin-accueil", [
  a.locator("nav[aria-label=Back-office]"),
  a.locator("main .card").first(),
  a.getByRole("button", { name: /Fermer les commandes/ }),
  a.getByRole("link", { name: /Mettre un produit en rupture/ }),
  a.getByText("Sécurité").first(),
]);
await a.goto(B + "/admin/commandes", { waitUntil: "networkidle" });
await a.waitForTimeout(1500);
const card = a.locator("main div, main li, main article").filter({ hasText: "Marie Durand" }).filter({ has: a.getByRole("button", { name: /Acceptée/ }) }).last();
await shot(a, "admin-commandes", [
  a.getByRole("button", { name: /Activer le son/ }),
  a.locator("summary").filter({ hasText: "Impression" }),
  a.locator("main h2").first(),
  card,
  card.getByRole("button", { name: /Acceptée/ }),
  card.getByRole("button", { name: /Imprimer la commande/ }),
  card.getByRole("link", { name: "Détail" }),
  card.getByRole("button", { name: "Refuser" }),
]);
await a.locator("summary").filter({ hasText: "Impression" }).click();
await a.waitForTimeout(400);
await shot(a, "admin-impression-poste", [a.locator("details[open]").filter({ hasText: "Imprimer automatiquement" }).locator("> div, > :not(summary)").first()]);
await a.keyboard.press("Escape");
await a.goto(B + "/admin/commandes", { waitUntil: "networkidle" });
await a.waitForTimeout(1000);
const href = await card.getByRole("link", { name: "Détail" }).getAttribute("href");
await card.getByRole("button", { name: /Acceptée/ }).click();
await a.waitForTimeout(1500);
await shot(a, "admin-commandes-acceptee", [a.getByRole("button", { name: /En préparation|Prête/ }).first()]);
await a.goto(B + href, { waitUntil: "networkidle" });
await shot(a, "admin-fiche-commande", [
  a.locator("main h1"),
  a.locator("main button.btn-primary").first(),
  a.getByRole("button", { name: /Imprimer ici/ }),
  a.getByText(/Encaisser|Marquer|Règlement|Paiement reçu/).first(),
  a.getByText("Annuler la commande").first(),
], { full: true });
await a.goto(B + "/admin/cuisine", { waitUntil: "networkidle" });
await a.waitForTimeout(1500);
await shot(a, "admin-cuisine", [
  a.locator("body *").filter({ hasText: "Sans sésame" }).filter({ hasText: "Toucher" }).last(),
  a.getByText("Sans sésame").first(),
  a.getByRole("button", { name: /Activer le son/ }),
  a.getByRole("button", { name: /Plein écran/ }),
]);
await a.goto(B + "/admin/commandes/historique", { waitUntil: "networkidle" });
await shot(a, "admin-historique", [a.locator("main form").first(), a.locator("main table"), a.locator("main table a").first()]);

await a.goto(B + "/admin/menu", { waitUntil: "networkidle" });
await a.locator("main details summary").first().click();
await a.waitForTimeout(500);
await shot(a, "admin-menu", [
  a.locator("main input[type=search], main input[placeholder*='Rechercher']").first(),
  a.locator("main details summary").first(),
  a.getByRole("switch", { name: /Disponible|RUPTURE/ }).first().or(a.getByRole("button", { name: /Disponible/ }).first()),
  a.getByRole("button", { name: /Au menu|Retiré/ }).first().or(a.getByText(/Au menu/).first()),
  a.getByRole("link", { name: "+ Produit" }),
]);
const prod = await a.locator("main details[open] a[href*='/admin/menu/produits/']").first().getAttribute("href");
await a.goto(B + prod, { waitUntil: "networkidle" });
await shot(a, "admin-produit", [
  a.locator("#name, input[name=name]").first(),
  a.locator("input[name=price]").first(),
  a.getByText("Restaurants", { exact: false }).first(),
  a.getByRole("heading", { name: "Allergènes" }),
  a.getByRole("button", { name: /Enregistrer/ }).first(),
], { full: true });

await a.goto(B + "/admin/promos", { waitUntil: "networkidle" });
await shot(a, "admin-promos", [a.getByRole("heading", { name: "Nouveau code" })], { full: true });

for (const [tab, marks] of [
  ["infos", (p) => [p.locator("main input").first(), p.locator("main textarea").last()]],
  ["horaires", (p) => [p.getByRole("heading", { name: "Horaires d'ouverture" }), p.getByRole("heading", { name: "Fermetures exceptionnelles" })]],
  ["livraison", (p) => [p.locator("main details").filter({ hasText: "Zone 2" }).first(), p.locator("main details[open] textarea").first(), p.locator("main details[open] input").first(), p.locator("main summary").filter({ hasText: "Nouvelle zone" })]],
  ["services", (p) => [p.locator("main legend").first()]],
  ["paiements", (p) => [p.getByRole("heading", { name: "Moyens de paiement acceptés" }), p.getByRole("heading", { name: /Stripe/ })]],
  ["impression", (p) => [p.getByRole("heading", { name: /BizPrint/ }), p.locator("main summary").filter({ hasText: "Navigateur" }).first(), p.locator("main details[open] select").first()]],
]) {
  await a.goto(B + `/admin/restaurant?onglet=${tab}`, { waitUntil: "networkidle" });
  if (tab === "livraison") await a.locator("main summary").filter({ hasText: "Zone 2" }).first().click();
  if (tab === "impression") await a.locator("main summary").filter({ hasText: "Nouvelle imprimante" }).first().click();
  await shot(a, `admin-restaurant-${tab}`, [a.locator("main a[aria-current=page]"), ...marks(a)], { full: true });
}

await a.goto(B + "/admin/compta", { waitUntil: "networkidle" });
await shot(a, "admin-compta", [a.locator("main form").first(), a.getByRole("heading", { name: "TVA" }), a.getByRole("link", { name: /Export|Excel/ }).first()]);
await a.goto(B + "/admin/compta/clotures", { waitUntil: "networkidle" });
await shot(a, "admin-clotures", [a.locator("main button, main form").first()], { full: true });
await a.goto(B + "/admin/utilisateurs", { waitUntil: "networkidle" });
await shot(a, "admin-utilisateurs", [a.locator("main .card").first(), a.getByRole("heading", { name: "Nouveau compte" }), a.getByText(ADMIN_EMAIL).locator("..")], { full: true });
await a.goto(B + "/admin/journal", { waitUntil: "networkidle" });
await shot(a, "admin-journal", [a.locator("main table, main ul").first()]);
await a.goto(B + "/admin/configuration", { waitUntil: "networkidle" });
await shot(a, "admin-configuration", [
  a.getByRole("heading", { name: "Services par restaurant" }),
  a.getByRole("heading", { name: "Commandes" }),
  a.getByRole("heading", { name: "Site public" }),
  a.getByRole("heading", { name: "Pays, devise et langues" }),
  a.getByRole("heading", { name: /Traduction automatique/ }),
  a.getByRole("button", { name: "Enregistrer la configuration" }),
], { full: true });
await a.goto(B + "/admin/reglages", { waitUntil: "networkidle" });
await shot(a, "admin-reglages", [a.getByRole("heading", { name: "Identité" }), a.getByRole("heading", { name: "Page d'accueil" }), a.getByRole("heading", { name: "Mentions légales" })], { full: true });
await a.goto(B + "/admin/traductions?langue=en", { waitUntil: "networkidle" });
await shot(a, "admin-traductions", [
  a.locator("[role=tablist]"),
  a.getByRole("button", { name: /Tout traduire/ }),
  a.getByRole("link", { name: "Carte" }).first(),
  a.getByRole("link", { name: /À faire/ }),
  a.locator("main input[name^='tr:']").first(),
]);
await a.goto(B + "/admin/api", { waitUntil: "networkidle" });
await shot(a, "admin-api", [a.locator("main h2").first()], { full: true });
await a.goto(B + "/admin/securite", { waitUntil: "networkidle" });
await shot(a, "admin-securite", [a.locator("main h1, h1").first()]);

console.log(warnings.length ? "AVERTISSEMENTS :\n" + warnings.join("\n") : "Tous les repères trouvés.");
await browser.close();
