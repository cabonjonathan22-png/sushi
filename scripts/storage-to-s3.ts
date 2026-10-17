/**
 * Copie les images du dossier local `storage/` vers le stockage S3 compatible
 * (Cloudflare R2, Scaleway, AWS…). Indispensable avant un hébergement serverless
 * (Vercel) où le disque n'est pas conservé.
 *
 * Usage : définir S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY (et S3_PUBLIC_URL)
 * dans .env, puis : npm run storage:s3
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { putFile } from "../src/lib/storage";

const ROOT = path.resolve(process.env.STORAGE_DIR ?? "storage");
const TYPES: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf" };

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function main() {
  if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET manquant : renseignez le stockage S3 dans .env.");
  let n = 0;
  for await (const file of walk(ROOT)) {
    const key = path.relative(ROOT, file).split(path.sep).join("/");
    await putFile(key, await readFile(file), TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    if (++n % 50 === 0) console.log(`${n} fichiers…`);
  }
  console.log(`${n} fichier(s) copiés vers ${process.env.S3_BUCKET}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
