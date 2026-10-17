import { createHash } from "node:crypto";
import { hmacSha256, safeEqual } from "../crypto";

/** Signatures BizPrint et liens signés vers les tickets PDF (fonctions pures, testées). */

export interface BizPrintKeys {
  publicKey: string;
  secretKey: string;
}

export function signGet(query: Record<string, string>, keys: BizPrintKeys, time = Math.floor(Date.now() / 1000)): URLSearchParams {
  const params = new URLSearchParams(query);
  params.set("publicKey", keys.publicKey);
  params.set("time", String(time));
  params.set("hash", createHash("sha256").update(`${params.toString()}:${keys.secretKey}`).digest("hex"));
  return params;
}

export function signPost(data: Record<string, unknown>, keys: BizPrintKeys, time = Math.floor(Date.now() / 1000)): Record<string, unknown> {
  const toSign = { ...data, publicKey: keys.publicKey, time };
  return { ...toSign, hash: createHash("sha256").update(`${JSON.stringify(toSign)}:${keys.secretKey}`).digest("hex") };
}

// ───────────── Lien signé vers le PDF du ticket ─────────────

const LINK_TTL_S = 30 * 60;
const linkSecret = () => `print-document:${process.env.APP_ENCRYPTION_KEY ?? ""}`;

export function documentUrl(printJobId: string, now = Math.floor(Date.now() / 1000)): string {
  const exp = now + LINK_TTL_S;
  const sig = hmacSha256(linkSecret(), `${printJobId}.${exp}`);
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/print/document/${printJobId}?exp=${exp}&sig=${sig}`;
}

export function verifyDocumentLink(printJobId: string, exp: string, sig: string, now = Math.floor(Date.now() / 1000)): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now || !/^[a-f0-9]{64}$/.test(sig)) return false;
  return safeEqual(hmacSha256(linkSecret(), `${printJobId}.${e}`), sig);
}

