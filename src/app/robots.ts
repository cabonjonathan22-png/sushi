import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/compte", "/commande/", "/commander/*/valider"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
