import { allergenCodes, allergensDeclared } from "@/lib/catalog-constants";
import { apiAuth } from "@/lib/api-auth";
import { json } from "@/lib/http";
import { loadMenu } from "@/lib/menu";
import { appUrl } from "@/lib/seo";

/** GET /api/v1/menu — menu du restaurant de la clé, avec prix, variantes, options et disponibilités. */
export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  const menu = await loadMenu(auth.restaurantId, { includeHidden: new URL(req.url).searchParams.get("include_hidden") === "1" });
  const abs = (u: string | undefined) => (u ? (u.startsWith("http") ? u : `${appUrl()}${u}`) : null);
  return json({
    data: {
      categories: menu.categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, kind: c.kind, productIds: c.productIds })),
      products: menu.products.map((p) => ({
        id: p.id, slug: p.slug, name: p.name, description: p.shortDescription,
        price: p.priceCents, vatRate: p.vatRate / 100, available: p.active && !p.outOfStock, outOfStock: p.outOfStock,
        image: abs(p.imageLarge?.src), badges: p.badges, allergens: allergenCodes(p.allergens), allergensDeclared: allergensDeclared(p.allergens), alcohol: p.isAlcohol, maxQuantity: p.maxQuantity,
        modes: { pickup: p.availablePickup, delivery: p.availableDelivery, dineIn: p.availableDineIn },
        variants: p.variants.map((v) => ({ id: v.id, label: v.label, price: v.priceCents, available: v.active && !v.outOfStock })),
        optionGroups: p.optionGroups.map((g) => ({
          id: g.id, name: g.name, min: g.minSelect, max: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDeltaCents, available: o.active })),
        })),
      })),
    },
  });
}
