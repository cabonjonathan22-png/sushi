import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Jeton aléatoire URL-safe (sessions, suivi de commande, jetons d'imprimante). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY manquant (32 octets en base64)");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY doit faire 32 octets (base64)");
  return k;
}

/**
 * Chiffrement AES-256-GCM des secrets stockés en base (clés Stripe, secrets 2FA).
 * Format : v1.<iv>.<tag>.<données> (base64url).
 */
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  if (!enc) return "";
  const [v, iv, tag, data] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Secret chiffré illisible");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Affiche un secret de façon masquée : « sk_live_…a1b2 ». */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  return `${plain.slice(0, 8)}…${plain.slice(-4)}`;
}
