import { cache } from "react";
import { parseConfig, type AppConfig } from "./config-schema";
import { db } from "./db";

export { parseConfig, type AppConfig } from "./config-schema";

/** Configuration générale (lue une fois par requête). */
export const getConfig = cache(async (): Promise<AppConfig> => {
  const s = await db.siteSettings.findUnique({ where: { id: 1 }, select: { config: true } });
  return parseConfig(s?.config);
});

/** Variante hors requête (worker, scripts) : pas de cache React. */
export async function readConfig(): Promise<AppConfig> {
  const s = await db.siteSettings.findUnique({ where: { id: 1 }, select: { config: true } });
  return parseConfig(s?.config);
}
