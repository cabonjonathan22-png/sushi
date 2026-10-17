import { db } from "@/lib/db";

/** Anciennes fiches produit WordPress (/produit/<slug>/) → 301 vers le menu, fiche du produit ouverte. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, first] = await Promise.all([
    db.product.findFirst({ where: { OR: [{ legacySlug: slug }, { slug }] }, select: { slug: true } }),
    db.restaurant.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true } }),
  ]);
  const base = first ? `/commander/${first.slug}` : "/commander";
  const target = p ? `${base}?produit=${encodeURIComponent(p.slug)}` : base;
  return new Response(null, { status: 301, headers: { Location: new URL(target, req.url).toString() } });
}
