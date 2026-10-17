import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Politique de sécurité du contenu : Stripe (paiement), API Adresse (autocomplétion).
 * 'unsafe-inline' sur les styles/scripts est requis par Next.js sans nonce.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://api-adresse.data.gouv.fr https://geo.api.gouv.fr",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** Anciennes pages WordPress → nouvelles pages (301). Produits et catégories : routes dédiées. */
const legacyPages: [string, string][] = [
  ["/commander-2", "/commander"],
  ["/panier", "/commander"],
  ["/boutique", "/commander"],
  ["/mon-compte", "/compte"],
  ["/mon-compte/:path*", "/compte"],
  ["/accompagnements-2", "/commander"],
  ["/sample-page", "/"],
  ["/gallery", "/"],
  ["/whats-on", "/"],
  ["/our-story", "/"],
  ["/food-drinks", "/"],
  ["/2025/04/01/hello-world", "/"],
  ["/category/:path*", "/"],
  ["/product-labels/:path*", "/commander"],
  ["/feed", "/"],
  ["/wp-sitemap.xml", "/sitemap.xml"],
  ["/sitemap_index.xml", "/sitemap.xml"],
];

/**
 * Fiches produit et catégories WordPress → menu (correspondances issues de l'import).
 * Une seule redirection 301, que l'ancienne URL se termine par « / » ou non.
 */
function legacyCatalog(): [string, string][] {
  const file = "import/data.json";
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    restaurant: { slug: string };
    produits: { ancienneUrl: string; slug: string }[];
    categories: { ancienneUrl: string; slug: string }[];
  };
  const menu = `/commander/${data.restaurant.slug}`;
  return [
    ...data.produits.map((p) => [p.ancienneUrl.replace(/\/$/, ""), `${menu}?produit=${p.slug}`] as [string, string]),
    ...data.categories.map((c) => [c.ancienneUrl.replace(/\/$/, ""), `${menu}#cat-${c.slug}`] as [string, string]),
  ];
}

const config: NextConfig = {
  output: "standalone",
  // Les anciennes URL WordPress finissent par « / » : on les redirige nous-mêmes en un seul 301
  // (sinon Next.js ferait d'abord un 308 vers l'URL sans « / », puis notre 301).
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg", "exceljs", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "8mb" }, // envoi de photos produit
  },
  async redirects() {
    const pairs = [...legacyPages, ...legacyCatalog()];
    return [
      ...pairs.flatMap(([source, destination]) => [
        { source, destination, statusCode: 301 as const },
        ...(source.includes(":") ? [] : [{ source: `${source}/`, destination, statusCode: 301 as const }]),
      ]),
      // Toute autre URL terminée par « / » → même URL sans « / ».
      { source: "/:path+/", destination: "/:path+", statusCode: 301 as const },
    ];
  },
  async headers() {
    const security = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://js.stripe.com\")" },
      ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
    ];
    return [
      { source: "/:path*", headers: security },
      // L'écran ticket est imprimé depuis une iframe du back-office (même origine).
      { source: "/admin/commandes/:id/ticket", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }] },
      { source: "/media/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default config;
