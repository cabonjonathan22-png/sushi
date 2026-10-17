import { hmacSha256, safeEqual } from "./crypto";

/**
 * Lien « définir mon mot de passe » (inscription et mot de passe oublié), sans table :
 * signé avec APP_ENCRYPTION_KEY, valable 1 heure, et invalidé dès que le mot de passe change
 * (l'empreinte actuelle du mot de passe fait partie de la signature).
 */
const TTL_MS = 60 * 60_000;
const secret = () => {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("APP_ENCRYPTION_KEY manquant");
  return `customer-link:${k}`;
};

export function makeCustomerLink(customerId: string, passwordHash: string, now = Date.now()): string {
  const exp = String(now + TTL_MS);
  const sig = hmacSha256(secret(), `${customerId}.${exp}.${passwordHash}`);
  return Buffer.from(`${customerId}.${exp}.${sig}`).toString("base64url");
}

export function readCustomerLink(token: string): { customerId: string; exp: number; sig: string } | null {
  try {
    const [customerId, exp, sig] = Buffer.from(token, "base64url").toString("utf8").split(".");
    if (!customerId || !exp || !sig) return null;
    return { customerId, exp: Number(exp), sig };
  } catch {
    return null;
  }
}

export function verifyCustomerLink(token: string, passwordHash: string, now = Date.now()): string | null {
  const t = readCustomerLink(token);
  if (!t || t.exp < now) return null;
  const expected = hmacSha256(secret(), `${t.customerId}.${t.exp}.${passwordHash}`);
  return safeEqual(expected, t.sig) ? t.customerId : null;
}
