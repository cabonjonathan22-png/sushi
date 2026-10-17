import { defineConfig, env } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  /* variables déjà fournies par l'environnement */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Absente pendant « npm install » sur un hébergeur : seules les commandes base l'exigent.
    url: process.env.DATABASE_URL ? env("DATABASE_URL") : "postgresql://localhost/absent",
  },
});
