/** Aides pour les routes d'API. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

/**
 * Protection CSRF des routes appelées par nos pages avec cookies :
 * l'en-tête Origin (ou Referer) doit être celui du site.
 */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * IP du client. X-Real-IP est posé par le proxy (Caddy) et écrase toute valeur envoyée par le client ;
 * à défaut, le DERNIER élément de X-Forwarded-For (ajouté par le proxy) — jamais le premier, falsifiable.
 */
export function ipFromHeaders(h: Headers): string {
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",").at(-1) ?? "").trim() || "inconnue";
}

export function clientIpFrom(req: Request): string {
  return ipFromHeaders(req.headers);
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Requête trop volumineuse");
  return JSON.parse(text);
}
