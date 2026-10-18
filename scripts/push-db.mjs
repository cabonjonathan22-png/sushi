// Copie la base locale (carte, historique, comptes, réglages) vers la base de production.
// ⚠️ Remplace ENTIÈREMENT le contenu de la base cible.
//
// Usage : renseigner PROD_DATABASE_URL (adresse DIRECTE, sans pooler) dans .env, puis :
//   npm run db:push-prod -- --confirm
import { execSync } from "node:child_process";

try { process.loadEnvFile(".env"); } catch { /* variables déjà présentes */ }
const source = process.env.DATABASE_URL;
const target = process.env.PROD_DATABASE_URL;
if (!source || !target) throw new Error("DATABASE_URL (locale) et PROD_DATABASE_URL (production) sont requises dans .env.");
if (source === target) throw new Error("La base source et la base cible sont identiques.");
const host = new URL(target).host;
if (!process.argv.includes("--confirm")) {
  console.log(`Ceci va REMPLACER tout le contenu de la base ${host}.\nRelancez avec --confirm pour continuer.`);
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });
console.log(`→ Vidage de la base cible (${host})…`);
sh(`psql "${target}" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`);
console.log("→ Copie des données…");
sh(`pg_dump --no-owner --no-acl "${source}" | psql "${target}" -v ON_ERROR_STOP=1 -q`);
console.log("✓ Base de production à jour. Relancez un déploiement Vercel (Redeploy) si besoin.");
