import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { documentUrl, signGet, signPost, verifyDocumentLink } from "../print/bizprint-sign";
import { encodeCp858 } from "../print/escpos";

const keys = { publicKey: "pk_test_abc123", secretKey: "sk_test_secret456" };

describe("BizPrint : signature (identique au client officiel BizSwoop)", () => {
  it("signe une requête GET", () => {
    const params = signGet({ page: "1" }, keys, 1700000000);
    const base = new URLSearchParams({ page: "1", publicKey: keys.publicKey, time: "1700000000" });
    expect(params.get("hash")).toBe(createHash("sha256").update(`${base.toString()}:${keys.secretKey}`).digest("hex"));
  });

  it("signe un corps POST", () => {
    const data = { printerId: 1, url: "https://example.com/doc.pdf", description: "Test" };
    const body = signPost(data, keys, 1700000000);
    const toSign = { ...data, publicKey: keys.publicKey, time: 1700000000 };
    expect(body.hash).toBe(createHash("sha256").update(`${JSON.stringify(toSign)}:${keys.secretKey}`).digest("hex"));
    expect(body.printerId).toBe(1);
  });
});

describe("lien signé vers le PDF du ticket", () => {
  process.env.APP_ENCRYPTION_KEY ??= "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNA==";
  it("accepte un lien valide, refuse un lien modifié ou expiré", () => {
    const now = 1_800_000_000;
    const url = new URL(documentUrl("job123", now));
    const exp = url.searchParams.get("exp")!;
    const sig = url.searchParams.get("sig")!;
    expect(verifyDocumentLink("job123", exp, sig, now)).toBe(true);
    expect(verifyDocumentLink("job124", exp, sig, now)).toBe(false);
    expect(verifyDocumentLink("job123", String(Number(exp) + 60), sig, now)).toBe(false);
    expect(verifyDocumentLink("job123", exp, sig, Number(exp) + 1)).toBe(false);
  });
});

describe("ESC/POS : accents français (CP858)", () => {
  it("encode é, à, ç, € sans perte", () => {
    expect(encodeCp858("é à ç €")).toEqual([0x82, 0x20, 0x85, 0x20, 0x87, 0x20, 0xd5]);
    expect(encodeCp858("ñ")).toEqual([0x6e]); // accent non prévu : retiré
  });
});
