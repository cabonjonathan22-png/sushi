import { getSiteSettings } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

/** Tablette du restaurant : « Ajouter à l'écran d'accueil » ouvre directement les commandes en cours. */
export async function GET() {
  const s = await getSiteSettings();
  return Response.json({
    name: `${s.brandName} — Commandes`,
    short_name: "Commandes",
    start_url: "/admin/commandes",
    scope: "/admin",
    display: "standalone",
    orientation: "any",
    background_color: "#1f1a17",
    theme_color: "#1f1a17",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
