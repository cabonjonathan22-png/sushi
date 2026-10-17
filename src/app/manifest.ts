import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";
import { getSiteSettings } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

/** Installation sur l'écran d'accueil du téléphone (raccourci « appli »). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [s, c] = await Promise.all([getSiteSettings(), getConfig()]);
  return {
    name: s.brandName,
    short_name: s.brandName,
    description: c.site.seoDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f1",
    theme_color: "#1f1a17",
    lang: c.region.defaultLocale,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
