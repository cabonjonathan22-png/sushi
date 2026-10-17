import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

/** Double authentification par application (Google Authenticator, Microsoft Authenticator…). */

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new TOTP({ issuer: process.env.TOTP_ISSUER ?? "Restaurant", label, secret: Secret.fromBase32(secret), digits: 6, period: 30 });
}

/** Vérifie un code à 6 chiffres (tolère ±30 s de décalage d'horloge). */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return totp(secret, "").validate({ token: clean, window: 1 }) !== null;
}

export async function totpQrDataUrl(secret: string, email: string): Promise<string> {
  return QRCode.toDataURL(totp(secret, email).toString(), { margin: 1, width: 220 });
}
