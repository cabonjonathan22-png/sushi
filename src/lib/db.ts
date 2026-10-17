import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Client Prisma unique (réutilisé entre rechargements à chaud en développement). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant (voir .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
/** Client utilisable dans une transaction interactive. */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
