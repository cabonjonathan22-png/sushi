import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Stockage des fichiers (images WebP) :
 *  - S3 compatible (Scaleway, OVH, AWS…) si S3_BUCKET est défini ;
 *  - sinon dossier local `storage/` (développement / petit VPS), servi par /media/….
 */

const LOCAL_ROOT = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? "storage");

function s3(): { client: S3Client; bucket: string } | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return {
    bucket,
    client: new S3Client({
      region: process.env.S3_REGION ?? "fr-par",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
    }),
  };
}

/** Clé de stockage sûre : lettres, chiffres, « - _ . / » uniquement, sans « .. ». */
export function safeKey(key: string): string {
  const k = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!/^[A-Za-z0-9._/-]+$/.test(k) || k.split("/").some((p) => p === ".." || p === "")) throw new Error(`Clé invalide : ${key}`);
  return k;
}

export async function putFile(key: string, body: Buffer, contentType: string): Promise<void> {
  const k = safeKey(key);
  const remote = s3();
  if (remote) {
    await remote.client.send(new PutObjectCommand({
      Bucket: remote.bucket, Key: k, Body: body, ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      // Cloudflare R2 : pas d'ACL (rendre le bucket public dans R2) → S3_NO_ACL=1.
      ...(process.env.S3_NO_ACL === "1" ? {} : { ACL: "public-read" as const }),
    }));
    return;
  }
  const file = path.join(/* turbopackIgnore: true */ LOCAL_ROOT, k);
  await mkdir(path.dirname(/* turbopackIgnore: true */ file), { recursive: true });
  await writeFile(file, body);
}

/** Lecture locale (route /media) ; null si absent. */
export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(/* turbopackIgnore: true */ LOCAL_ROOT, safeKey(key)));
  } catch {
    return null;
  }
}

export async function readFileAny(key: string): Promise<Buffer | null> {
  const remote = s3();
  if (!remote) return readLocalFile(key);
  try {
    const r = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: safeKey(key) }));
    return Buffer.from(await r.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

/** URL publique d'un fichier. */
export function mediaUrl(key: string): string {
  const base = process.env.S3_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : `/media/${key}`;
}
