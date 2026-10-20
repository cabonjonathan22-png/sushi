import { getCustomer } from "@/lib/auth/session";
import { readConfig } from "@/lib/config";
import { ensureCardNumber } from "@/lib/loyalty-card";
import { cardHtml } from "@/lib/print/card-html";
import { getSiteSettings } from "@/lib/restaurants";

/** Carte de fidélité du client connecté, à imprimer (ou à garder ouverte sur le téléphone). */
export async function GET(req: Request) {
  const c = await getCustomer();
  if (!c) return Response.redirect(new URL("/compte", req.url), 303);
  if (!(await readConfig()).loyalty.enabled) return new Response("Carte de fidélité inactive", { status: 404 });
  const number = await ensureCardNumber(c.id);
  const format = new URL(req.url).searchParams.get("format") === "ticket" ? "ticket" : "carte";
  const html = await cardHtml({
    brand: (await getSiteSettings()).brandName, name: `${c.firstName} ${c.lastName}`.trim() || c.email, number, format,
    hint: "Présentez cette carte au restaurant pour cumuler vos points.",
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
