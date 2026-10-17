import { telHref } from "@/components/site/SiteChrome";
import type { PublicRestaurant } from "./restaurants";

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Données structurées schema.org Restaurant (horaires, adresse, zone desservie, menu). */
export function restaurantJsonLd(r: PublicRestaurant, opts: { image?: string; cuisine?: string; country?: string } = {}) {
  const image = opts.image;
  const url = appUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}/restaurants/${r.slug}#restaurant`,
    name: r.name,
    url: `${url}/restaurants/${r.slug}`,
    image: image ? [image.startsWith("http") ? image : `${url}${image}`] : undefined,
    telephone: r.phones[0] ? telHref(r.phones[0], opts.country).slice(4) : undefined,
    servesCuisine: opts.cuisine ? [opts.cuisine] : undefined,
    priceRange: "€€",
    address: {
      "@type": "PostalAddress",
      streetAddress: r.street,
      postalCode: r.postalCode,
      addressLocality: r.city,
      addressCountry: opts.country ?? "FR",
    },
    hasMap: r.mapsUrl || undefined,
    openingHoursSpecification: r.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DAY[h.weekday]}`,
      opens: h.opens,
      closes: h.closes,
    })),
    areaServed: [...new Set(r.zones.flatMap((z) => z.areas.map((a) => a.city)))].map((name) => ({ "@type": "City", name })),
    hasMenu: `${url}/commander/${r.slug}`,
    acceptsReservations: false,
    potentialAction: {
      "@type": "OrderAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}/commander/${r.slug}`, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
      deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
    },
  };
}

export function JsonLd({ data }: { data: object }) {
  // Échappement de « < » : empêche toute fermeture prématurée de la balise script.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** URL absolue (les images servies par /media sont relatives). */
export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${appUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

/** Fil d'Ariane (affiché dans les résultats Google). */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/** Questions fréquentes (peuvent apparaître directement dans les résultats). */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

/** Site + organisation : nom de marque, logo et réseaux sociaux reconnus par les moteurs. */
export function websiteJsonLd(o: { brand: string; description: string; sameAs: string[]; logo?: string }) {
  const url = appUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${url}/#website`, url: `${url}/`, name: o.brand, description: o.description, publisher: { "@id": `${url}/#organization` } },
      { "@type": "Organization", "@id": `${url}/#organization`, name: o.brand, url: `${url}/`, logo: o.logo ? absoluteUrl(o.logo) : `${url}/icon.svg`, sameAs: o.sameAs.filter(Boolean) },
    ],
  };
}
