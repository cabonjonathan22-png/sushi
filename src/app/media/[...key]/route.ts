import { readLocalFile, safeKey } from "@/lib/storage";

/** Sert les images du stockage local (en production avec S3, les URL pointent directement vers le CDN). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  let k: string;
  try {
    k = safeKey(key.join("/"));
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
  if (!k.endsWith(".webp")) return new Response("Introuvable", { status: 404 });
  const file = await readLocalFile(k);
  if (!file) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
