import Link from "next/link";
import type { T } from "@/i18n/server";
import { WEEKDAY_ORDER } from "@/lib/catalog-constants";
import type { PublicRestaurant } from "@/lib/restaurants";
import { CookieNotice } from "./CookieNotice";
import { IconFacebook, IconInstagram, IconPhone, IconPin, IconStar, IconUser } from "./icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";

/** Nom de l'enseigne, le dernier mot en couleur (« YAOMA SUSHI », « CHEZ PAOLO »…). */
export function Logo({ name, className = "" }: { name: string; className?: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : "";
  return (
    <span className={`font-display text-3xl uppercase leading-none tracking-wider ${className}`}>
      {words.join(" ")} {last && <span className="text-brand-500">{last}</span>}
    </span>
  );
}

/**
 * Lien d'appel. Numéro international (+…) gardé tel quel ; numéro local : préfixe du pays
 * si connu (ex. 04 90… → +33 4 90…), sinon tel quel (les téléphones savent l'appeler).
 */
const DIAL: Record<string, string> = { FR: "33", BE: "32", CH: "41", LU: "352", ES: "34", IT: "39", DE: "49", GB: "44", PT: "351", NL: "31", IE: "353", MC: "377" };
export function telHref(phone: string, country = "FR"): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  const dial = DIAL[country];
  return `tel:${dial && digits.startsWith("0") ? `+${dial}${digits.slice(1)}` : digits}`;
}

/** Nom de l'enseigne sur le site public : serif, dernier mot en italique couleur de la marque. */
export function Wordmark({ name, className = "" }: { name: string; className?: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : "";
  return (
    <span className={`font-display text-[1.7rem] font-semibold leading-none tracking-tight ${className}`}>
      {words.join(" ")}{last && <> <em className="font-normal text-brand-600">{last}</em></>}
    </span>
  );
}

export function SiteHeader({ brand, phone, country, showAccount = true, multiRestaurant, loyalty = false, t, locale, languages }: {
  brand: string;
  phone?: string;
  country?: string;
  showAccount?: boolean;
  multiRestaurant: boolean;
  /** Carte de fidélité active : lien « Fidélité ». */
  loyalty?: boolean;
  t: T;
  locale: string;
  languages: string[];
}) {
  const links = [
    { href: "/commander", label: t("nav.menu") },
    ...(multiRestaurant ? [{ href: "/restaurants", label: t("nav.restaurants") }] : []),
    { href: "/livraison", label: t("nav.delivery") },
    ...(loyalty ? [{ href: "/fidelite", label: t("nav.loyalty") }] : []),
    ...(showAccount ? [{ href: "/compte", label: t("nav.account") }] : []),
  ];
  const switcher = languages.length > 1 && <LanguageSwitcher current={locale} languages={languages} label={t("nav.language")} />;
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/90 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75">
      <div className="wrap relative flex h-16 items-center gap-4 sm:h-[4.5rem]">
        <Link href="/" aria-label={brand} className="me-auto text-char">
          <Wordmark name={brand} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label={brand}>
          {links.filter((l) => l.href !== "/compte").map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-4 py-2 text-[0.95rem] font-medium text-char/80 transition hover:bg-linen hover:text-char">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {phone && (
            <a href={telHref(phone, country)} className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-char hover:bg-linen md:flex">
              <IconPhone className="h-4 w-4 text-gold" /><span className="sr-only">{t("nav.call")}</span>{phone}
            </a>
          )}
          <span className="hidden lg:block">{switcher}</span>
          {showAccount && (
            <Link href="/compte" className="hidden h-10 w-10 place-items-center rounded-full text-char hover:bg-linen lg:grid" title={t("nav.account")}>
              <IconUser /><span className="sr-only">{t("nav.account")}</span>
            </Link>
          )}
          <Link href="/commander" className="btn min-h-10 rounded-full bg-char px-5 py-2 text-sm text-paper hover:bg-char-2">{t("nav.order")}</Link>
          <MobileMenu label={t("nav.openMenu")} links={links}
            footer={<>{switcher}{phone && <a href={telHref(phone, country)} className="btn-ghost min-h-10 rounded-full"><IconPhone className="h-4 w-4" />{phone}</a>}</>} />
        </div>
      </div>
    </header>
  );
}

/** Horaires regroupés : « Du mardi au dimanche : 10h00 – 14h00 · 17h30 – 21h30 ». */
export function hoursSummary(hours: PublicRestaurant["hours"], t: T, locale = "fr"): { days: string; ranges: string }[] {
  const time = (s: string) => (locale === "fr" ? s.replace(":", "h") : s);
  const byDay = new Map<number, string>();
  for (const d of WEEKDAY_ORDER) {
    byDay.set(d, hours.filter((h) => h.weekday === d).map((h) => `${time(h.opens)} – ${time(h.closes)}`).join(" · "));
  }
  const groups: { start: number; end: number; ranges: string }[] = [];
  for (const d of WEEKDAY_ORDER) {
    const ranges = byDay.get(d)!;
    const last = groups.at(-1);
    if (last && last.ranges === ranges) last.end = d;
    else groups.push({ start: d, end: d, ranges });
  }
  const day = (d: number) => t(`day.${d}` as "day.0");
  return groups.map((g) => ({
    days: g.start === g.end ? day(g.start) : t("footer.range", { from: day(g.start), to: day(g.end) }),
    ranges: g.ranges || t("footer.closed"),
  }));
}

export interface FooterOptions {
  text: string;
  facebookUrl: string;
  instagramUrl: string;
  googleReviewUrl: string;
}

export function SiteFooter({ brand, restaurant, restaurants, country, options, showAccount = true, loyalty = false, t, locale }: {
  brand: string;
  restaurant: PublicRestaurant | null;
  restaurants: { slug: string; name: string; city: string }[];
  country?: string;
  options: FooterOptions;
  showAccount?: boolean;
  loyalty?: boolean;
  t: T;
  locale: string;
}) {
  const social = "grid h-10 w-10 place-items-center rounded-full border border-white/15 text-paper/80 transition hover:border-gold hover:text-gold";
  const link = "transition hover:text-paper";
  return (
    <footer className="bg-char text-paper/70">
      <div className="wrap grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
        <div>
          <Wordmark name={brand} className="text-paper" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">{options.text}</p>
          <div className="mt-5 flex gap-2">
            {options.instagramUrl && <a href={options.instagramUrl} target="_blank" rel="noopener" className={social}><IconInstagram /><span className="sr-only">Instagram</span></a>}
            {options.facebookUrl && <a href={options.facebookUrl} target="_blank" rel="noopener" className={social}><IconFacebook /><span className="sr-only">Facebook</span></a>}
            {options.googleReviewUrl && <a href={options.googleReviewUrl} target="_blank" rel="noopener" className={social}><IconStar /><span className="sr-only">{t("footer.review")}</span></a>}
          </div>
        </div>
        {restaurant && (
          <div className="text-sm leading-relaxed">
            <h2 className="eyebrow mb-4">{t("footer.findUs")}</h2>
            {restaurants.length > 1 ? (
              <ul className="space-y-2">
                {restaurants.map((r) => <li key={r.slug}><Link href={`/restaurants/${r.slug}`} className={link}>{r.name} — {r.city}</Link></li>)}
              </ul>
            ) : (
              <>
                <address className="not-italic">{restaurant.street}<br />{restaurant.postalCode} {restaurant.city}</address>
                <p className="mt-3 flex flex-col">
                  {restaurant.phones.map((p) => <a key={p} href={telHref(p, country)} className={link}>{p}</a>)}
                </p>
                {restaurant.mapsUrl && <a href={restaurant.mapsUrl} className="mt-3 inline-flex items-center gap-1.5 text-gold hover:text-paper" rel="noopener" target="_blank"><IconPin className="h-4 w-4" />{t("footer.directions")}</a>}
              </>
            )}
          </div>
        )}
        {restaurant && (
          <div className="text-sm">
            <h2 className="eyebrow mb-4">{t("footer.hours")}</h2>
            <ul className="space-y-3">
              {hoursSummary(restaurant.hours, t, locale).map((g) => <li key={g.days}><span className="text-paper">{g.days}</span><br />{g.ranges}</li>)}
            </ul>
          </div>
        )}
        <nav className="text-sm" aria-label={brand}>
          <h2 className="eyebrow mb-4">{brand}</h2>
          <ul className="space-y-2">
            <li><Link href="/commander" className={link}>{t("nav.menu")}</Link></li>
            <li><Link href="/livraison" className={link}>{t("footer.zones")}</Link></li>
            {restaurants.length > 1 && <li><Link href="/restaurants" className={link}>{t("nav.restaurants")}</Link></li>}
            {showAccount && <li><Link href="/compte" className={link}>{t("nav.account")}</Link></li>}
            {loyalty && <li><Link href="/fidelite" className={link}>{t("loyalty.title")}</Link></li>}
            <li><Link href="/allergenes" className={link}>{t("footer.allergens")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="wrap flex flex-col gap-3 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t("footer.legal")}>
            <span>© {new Date().getFullYear()} {brand}</span>
            <Link href="/mentions-legales" className={link}>{t("footer.legal")}</Link>
            <Link href="/cgv" className={link}>{t("footer.terms")}</Link>
            <Link href="/confidentialite" className={link}>{t("footer.privacy")}</Link>
            <Link href="/cookies" className={link}>{t("footer.cookies")}</Link>
          </nav>
          <p className="max-w-md text-paper/50 sm:text-end">{t("alcohol.notice")} {t("alcohol.minors")}</p>
        </div>
      </div>
      <CookieNotice />
    </footer>
  );
}
