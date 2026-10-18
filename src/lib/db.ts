import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Client Prisma unique (réutilisé entre rechargements à chaud en développement). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant (voir .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/**
 * Créé à la première requête (et non à l'import) : la compilation (« next build »)
 * fonctionne même sans base configurée, par exemple au premier déploiement Vercel.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

export type Db = typeof db;
/** Client utilisable dans une transaction interactive. */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
