import { db } from "@/lib/db";

/** Anciennes catégories WordPress (/categorie-produit/<slug>/) → 301 vers la section du menu. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await db.category.findFirst({ where: { OR: [{ legacyUrl: `/categorie-produit/${slug}/` }, { slug }] }, select: { slug: true } });
  const [first] = await db.restaurant.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, take: 1, select: { slug: true } });
  const base = first ? `/commander/${first.slug}` : "/commander";
  return new Response(null, { status: 301, headers: { Location: new URL(c ? `${base}#cat-${c.slug}` : base, req.url).toString() } });
}
