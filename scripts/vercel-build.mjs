// Compilation sur Vercel : client Prisma, migrations de la base (si elle est configurée), puis Next.js.
// Variables reconnues : DATABASE_URL (pooler) et, pour les migrations, DATABASE_URL_DIRECT
// ou DATABASE_URL_UNPOOLED (créée automatiquement par l'intégration Neon de Vercel).
import { execSync } from "node:child_process";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

run("npx prisma generate");

const direct = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (direct) {
  run("npx prisma migrate deploy", { DATABASE_URL: direct });
} else {
  console.warn(
    "\n⚠️  Aucune base de données configurée (DATABASE_URL absente) : migrations ignorées.\n" +
      "   Le site sera compilé mais ne fonctionnera qu'une fois la base ajoutée :\n" +
      "   Vercel → Storage → Create Database → Neon, puis Redeploy. Voir docs/deploiement-vercel.md.\n",
  );
}

run("npx next build");
