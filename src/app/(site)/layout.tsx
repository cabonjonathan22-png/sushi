import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { getPublicRestaurant, getSiteSettings, heroImage, listRestaurants } from "@/lib/restaurants";

// Toutes les pages du site lisent la base (horaires, pied de page) et la langue : rendu à la demande.
export const dynamic = "force-dynamic";

/** Titre, description et image de partage par défaut : réglables dans Configuration → Site public. */
export async function generateMetadata(): Promise<Metadata> {
  const [c, s, hero, { locale }] = await Promise.all([getConfig(), getSiteSettings(), heroImage(1280), getI18n()]);
  const images = hero ? [{ url: hero.src, width: 1280, alt: s.brandName }] : undefined;
  return {
    title: { default: c.site.seoTitle, template: `%s · ${s.brandName}` },
    description: c.site.seoDescription,
    applicationName: s.brandName,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: { type: "website", siteName: s.brandName, title: c.site.seoTitle, description: c.site.seoDescription, locale, images },
    twitter: { card: "summary_large_image", title: c.site.seoTitle, description: c.site.seoDescription, images: images?.map((i) => i.url) },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [list, config, settings, i18n] = await Promise.all([listRestaurants(), getConfig(), getSiteSettings(), getI18n()]);
  const restaurant = list[0] ? await getPublicRestaurant(list[0].slug) : null;
  const { t, locale, dict } = i18n;
  const languages = [...new Set([config.region.defaultLocale, ...config.region.languages, locale])];
  const country = config.region.country;
  return (
    <I18nProvider locale={locale} dict={dict} currency={config.region.currency} moneyLocale={config.region.defaultLocale}>
      <div className="site-theme flex min-h-dvh flex-col text-char">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
          {t("nav.skip")}
        </a>
        {config.site.announcementActive && config.site.announcement && (
          <p role="status" className="bg-char px-4 py-2 text-center text-sm font-medium text-paper">{config.site.announcement}</p>
        )}
        <SiteHeader brand={settings.brandName} phone={restaurant?.phones[0]} country={country} showAccount={config.customers.accountsEnabled}
          multiRestaurant={list.length > 1} t={t} locale={locale} languages={languages} />
        <main id="contenu" className="flex-1">{children}</main>
        <SiteFooter brand={settings.brandName} restaurant={restaurant} restaurants={list} country={country} showAccount={config.customers.accountsEnabled} t={t} locale={locale}
          options={{ text: config.site.footerText, facebookUrl: config.site.facebookUrl, instagramUrl: config.site.instagramUrl, googleReviewUrl: config.site.googleReviewUrl }} />
      </div>
    </I18nProvider>
  );
}
