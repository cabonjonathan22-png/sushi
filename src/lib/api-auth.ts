import { sha256 } from "./crypto";
import { db } from "./db";
import { json } from "./http";
import { LIMITS, rateLimit } from "./rate-limit";

/**
 * Authentification de l'API publique : `Authorization: Bearer ysk_…`.
 * Une clé est liée à un seul restaurant ; elle ne voit que ses données.
 */
export async function apiAuth(req: Request): Promise<{ restaurantId: string; keyName: string; keyId: string } | Response> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^ysk_[A-Za-z0-9_-]{20,64}$/.test(key)) return apiError(401, "unauthorized", "Clé API manquante ou invalide.");
  const k = await db.apiKey.findUnique({ where: { hash: sha256(key) } });
  if (!k || k.revokedAt) return apiError(401, "unauthorized", "Clé API inconnue ou révoquée.");
  if (!(await rateLimit(`api:${k.id}`, LIMITS.api.limit, LIMITS.api.window))) return apiError(429, "rate_limited", "Trop de requêtes (300 par minute).");
  // Mise à jour « dernière utilisation » au plus une fois par minute.
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
  return { restaurantId: k.restaurantId, keyName: k.name, keyId: k.id };
}

export function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}
