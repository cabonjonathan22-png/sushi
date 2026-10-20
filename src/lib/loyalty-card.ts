import "server-only";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { db } from "./db";
import { appUrl } from "./seo";

/**
 * Carte de fidélité physique ou sur téléphone : un n° à 12 chiffres (dernier chiffre de
 * contrôle, comme les cartes bancaires) et un QR code. Le QR code contient une adresse
 * du site (/f/<n°>) : scanné par la tablette du restaurant (appareil photo ou scanner),
 * il ouvre la fiche fidélité du client dans le back-office.
 */

/** Chiffre de contrôle de Luhn (détecte une faute de frappe sur le n°). */
export function luhnDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidCardNumber(n: string): boolean {
  return /^\d{12}$/.test(n) && luhnDigit(n.slice(0, 11)) === Number(n[11]);
}

/** N° lu par un scanner, saisi à la main ou contenu dans l'adresse du QR code. */
export function parseCardInput(raw: string): string | null {
  const s = raw.trim();
  const fromUrl = s.match(/\/f\/(\d{12})(?:[/?#]|$)/)?.[1];
  const digits = fromUrl ?? s.replace(/[\s-]/g, "");
  return isValidCardNumber(digits) ? digits : null;
}

export const formatCardNumber = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

/** N° de carte du client, créé à la première demande. */
export async function ensureCardNumber(customerId: string): Promise<string> {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { cardNumber: true } });
  if (c.cardNumber) return c.cardNumber;
  for (;;) {
    const body = "29" + String(randomInt(0, 1_000_000_000)).padStart(9, "0");
    const number = body + luhnDigit(body);
    const updated = await db.customer.updateMany({ where: { id: customerId, cardNumber: null }, data: { cardNumber: number } }).catch(() => null);
    if (updated?.count) return number;
    const again = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { cardNumber: true } });
    if (again.cardNumber) return again.cardNumber;
  }
}

export const cardUrl = (number: string) => `${appUrl()}/f/${number}`;

/** QR code (SVG) de la carte. */
export function cardQrSvg(number: string): Promise<string> {
  return QRCode.toString(cardUrl(number), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1f1a17", light: "#ffffff" } });
}
