import Link from "next/link";
import { IconArrow, IconBag, IconCalendar, IconClock, IconFlame, IconLeaf, IconPin, IconScooter, IconShield, IconTable } from "@/components/site/icons";
import { ProductCard } from "@/components/site/ProductCard";
import { CtaBand, FaqList, SectionHeading } from "@/components/site/Sections";
import { hoursSummary, telHref } from "@/components/site/SiteChrome";
import { translateTexts } from "@/i18n/content";
import type { MessageKey } from "@/i18n/fr";
import { getI18n } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { money } from "@/lib/money";
import { deliveryTowns, getPublicRestaurant, getSiteSettings, heroImage, listRestaurants } from "@/lib/restaurants";
import { faqJsonLd, JsonLd, restaurantJsonLd, websiteJsonLd } from "@/lib/seo";
import { getShowcase } from "@/lib/showcase";

export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function HomePage() {
  const [settings, restaurants, config, i18n, hero, towns] = await Promise.all([
    getSiteSettings(), listRestaurants(), getConfig(), getI18n(), heroImage(1920), deliveryTowns(),
  ]);
  const { t, locale, defaultLocale } = i18n;
  const all = (await Promise.all(restaurants.map((r) => getPublicRestaurant(r.slug)))).filter((r) => r !== null);
  const main = all[0] ?? null;
  const country = config.region.country;
  const brand = settings.brandName;

  // Textes saisis par le restaurant, traduits dans la langue du visiteur si besoin.
  const raw = settings.content;
  const c = locale === defaultLocale ? { ...raw, cuisine: config.site.cuisine } : { ...raw, ...(await translateTexts("site", "home", {
    heroTitle: raw.heroTitle ?? "", heroTagline: raw.heroTagline ?? "", intro: raw.intro ?? "", commitment: raw.commitment ?? "", cuisine: config.site.cuisine,
  }, locale)) };
  const cuisine = ["en", "de"].includes(locale) ? c.cuisine : c.cuisine.toLocaleLowerCase(locale);
  // Sans service de traduction, la cuisine reste dans la langue du restaurant : pas de phrase mixte.
  const tagline = (city: string) => locale !== defaultLocale && c.cuisine === config.site.cuisine ? `${c.cuisine} · ${city}` : t("home.tagline", { cuisine, city });
  const showcase = main ? await getShowcase(main.id, locale, defaultLocale) : { featured: [], categories: [] };
  const orderHref = main && all.length === 1 ? `/commander/${main.slug}` : "/commander";

  const services = [
    { key: "PICKUP", icon: IconBag, title: t("home.pickup"), text: t("home.pickupText"), href: "/commander" },
    { key: "DELIVERY", icon: IconScooter, title: t("home.delivery"), text: t("home.deliveryText"), href: "/livraison" },
    { key: "DINE_IN", icon: IconTable, title: t("home.dineIn"), text: t("home.dineInText"), href: main ? `/restaurants/${main.slug}` : "/" },
  ].filter((s) => all.some((r) => r.services[s.key as "PICKUP"]));
  const trust = [
    { icon: IconShield, title: t("home.trust1"), text: t("home.trust1Text") },
    { icon: IconFlame, title: t("home.trust2"), text: t("home.trust2Text") },
    { icon: IconCalendar, title: t("home.trust3"), text: t("home.trust3Text") },
    { icon: IconLeaf, title: t("home.trust4"), text: t("home.trust4Text") },
  ];

  // FAQ construite à partir des vraies données (horaires, communes, paiements).
  const hours = main ? hoursSummary(main.hours, t, locale) : [];
  const payMethods = main ? [...new Set(main.paymentMethods.filter((m) => m.PICKUP || m.DELIVERY || m.DINE_IN).map((m) => t(`pay.${m.method}` as MessageKey)))] : [];
  const faq = [
    main && { q: t("faq.hoursQ"), a: t("faq.hoursA", { name: main.name, hours: hours.map((h) => `${h.days} : ${h.ranges}`).join(" ; ") }) },
    towns.length > 0 && { q: t("faq.deliveryQ"), a: t("faq.deliveryA", { towns: towns.map((x) => x.city).join(", ") }) },
    { q: t("faq.advanceQ"), a: t("faq.advanceA") },
    payMethods.length > 0 && { q: t("faq.payQ"), a: t("faq.payA", { methods: payMethods.join(", ") }) },
    main && { q: t("faq.whereQ"), a: t("faq.whereA", { name: main.name, address: `${main.street}, ${main.postalCode} ${main.city}` }) },
  ].filter((x): x is { q: string; a: string } => !!x);

  return (
    <>
      <JsonLd data={websiteJsonLd({ brand, description: config.site.seoDescription, sameAs: [config.site.facebookUrl, config.site.instagramUrl] })} />
      {all.map((r) => <JsonLd key={r.id} data={restaurantJsonLd(r, { image: hero?.src, cuisine: config.site.cuisine, country })} />)}
      <JsonLd data={faqJsonLd(faq)} />

      {/* Accueil : texte à gauche, grande photo à droite (empilés sur téléphone) */}
      <section className="relative overflow-hidden">
        <div className="wrap grid items-center gap-10 pb-16 pt-8 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-16">
          <div className="order-2 lg:order-1">
            {c.heroTitle && <p className="eyebrow">{c.heroTitle}</p>}
            <h1 className="mt-4 text-5xl sm:text-6xl lg:text-7xl">
              {brand}
              {main && <span className="mt-3 block font-sans text-lg font-normal tracking-normal text-muted sm:text-xl">{tagline(main.city)}</span>}
            </h1>
            {c.heroTagline && <p className="mt-6 max-w-xl font-display text-2xl italic leading-snug text-char/80">{c.heroTagline}</p>}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={orderHref} className="btn-primary rounded-full px-6 sm:px-8 sm:text-lg">{t("home.orderOnline")}</Link>
              <Link href={orderHref} className="btn rounded-full border border-char/20 px-6 text-char hover:bg-linen sm:px-7 sm:text-lg">{t("home.seeMenu")}</Link>
            </div>
            {main && (
              <p className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-sm ring-1 ring-line">
                <span className={`h-2.5 w-2.5 rounded-full ${main.openNow && !main.paused ? "bg-green-600 shadow-[0_0_0_4px_rgba(22,163,74,0.15)]" : "bg-neutral-400"}`} />
                {main.paused ? t("home.paused") : main.openNow ? t("home.openNow") : t("home.closedNow")}
              </p>
            )}
          </div>
          <div className="relative order-1 lg:order-2">
            <div className="aspect-[4/3] overflow-hidden rounded-[2rem] bg-linen shadow-[0_30px_60px_-30px_rgba(31,26,23,0.5)] lg:aspect-[4/5] lg:rounded-t-[12rem]">
              {hero && <img src={hero.src} srcSet={hero.srcSet} sizes="(min-width: 1024px) 560px, 100vw" alt={`${brand} — ${c.cuisine}`} fetchPriority="high" className="h-full w-full object-cover" />}
            </div>
            {main && hours.length > 0 && (
              <div className="absolute -bottom-6 start-4 hidden max-w-[17rem] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-line sm:block lg:-start-10 lg:bottom-10">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold"><IconClock className="h-4 w-4" />{t("home.hours")}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {hours.slice(0, 3).map((h) => <li key={h.days}><span className="font-semibold">{h.days}</span><br /><span className="text-muted">{h.ranges}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Engagements (bandeau de réassurance) */}
      <section aria-label={t("home.services")} className="border-y border-line bg-linen/60">
        <ul className="wrap grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-gold ring-1 ring-line"><Icon /></span>
              <span><strong className="block font-semibold">{title}</strong><span className="mt-1 block text-sm leading-relaxed text-muted">{text}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {/* Incontournables */}
      {showcase.featured.length > 0 && main && (
        <section className="wrap section-y" aria-labelledby="featured">
          <SectionHeading id="featured" eyebrow={t("home.featuredEyebrow")} title={t("home.featuredTitle")} text={t("home.featuredText")}
            action={{ href: `/commander/${main.slug}`, label: t("home.fullMenu") }} />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {showcase.featured.map(({ product, category }) => (
              <ProductCard key={product.id} product={product} href={`/commander/${main.slug}${category ? `#cat-${category}` : ""}`} badges={config.catalog.badges}
                fromLabel={(price) => t("menu.from", { price })} />
            ))}
          </div>
        </section>
      )}

      {/* La carte par catégorie */}
      {showcase.categories.length > 1 && main && (
        <section className="bg-white" aria-labelledby="explore">
          <div className="wrap section-y">
            <SectionHeading id="explore" eyebrow={t("nav.menu")} title={t("home.exploreTitle")} />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {showcase.categories.map((cat) => (
                <li key={cat.slug}>
                  <Link href={`/commander/${main.slug}#cat-${cat.slug}`} className="group flex items-center gap-3 rounded-2xl p-2 pe-4 ring-1 ring-line transition hover:bg-paper hover:ring-gold/60">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-linen sm:h-16 sm:w-16">
                      {cat.image && <img src={cat.image.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg leading-tight">{cat.name}</span>
                      <span className="text-xs text-muted">{t("home.dishes", { n: cat.count })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Comment commander */}
      {services.length > 0 && (
        <section className="wrap section-y" aria-labelledby="how">
          <SectionHeading id="how" center title={t("home.howTitle")} />
          <div className={`grid gap-5 ${services.length === 3 ? "md:grid-cols-3" : services.length === 2 ? "md:grid-cols-2" : ""}`}>
            {services.map(({ key, icon: Icon, title, text, href }) => (
              <Link key={key} href={href} className="group relative flex flex-col rounded-3xl bg-white p-7 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(31,26,23,0.35)]">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="h-7 w-7" /></span>
                <h3 className="mt-6 text-3xl">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{text}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">{t("home.start")}<IconArrow className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Notre maison */}
      {(c.intro || c.commitment) && (
        <section className="bg-char text-paper">
          <div className="wrap section-y grid gap-12 lg:grid-cols-2 lg:gap-20">
            {c.intro && (
              <div>
                <p className="eyebrow">{t("home.storyEyebrow")}</p>
                <h2 className="mt-3 text-4xl sm:text-5xl">{t("home.welcome")}</h2>
                <p className="mt-6 text-lg leading-relaxed text-paper/75">{c.intro}</p>
              </div>
            )}
            {c.commitment && (
              <div className="lg:border-s lg:border-white/10 lg:ps-20">
                <p className="eyebrow">{brand}</p>
                <h2 className="mt-3 text-4xl sm:text-5xl">{t("home.commitment")}</h2>
                <p className="mt-6 text-lg leading-relaxed text-paper/75">{c.commitment}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Restaurants et infos pratiques */}
      {main && (
        <section className="wrap section-y" aria-labelledby="near">
          <SectionHeading id="near" eyebrow={t("home.nearEyebrow")} title={all.length > 1 ? t("home.ourRestaurants") : t("home.nearTitle")} />
          <div className="grid gap-5 lg:grid-cols-3">
            {all.map((r) => (
              <article key={r.id} className="flex flex-col rounded-3xl bg-white p-7 ring-1 ring-line">
                <h3 className="text-3xl">{r.name}</h3>
                <p className="mt-3 flex gap-2 text-muted"><IconPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><span>{r.street}<br />{r.postalCode} {r.city}</span></p>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{r.phones.map((p) => <a key={p} href={telHref(p, country)} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-char">{p}</a>)}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  <Link href={`/restaurants/${r.slug}`} className="btn-ghost min-h-10 rounded-full border-line px-4 text-sm">{t("home.viewRestaurant")}</Link>
                  {r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noopener" className="btn-ghost min-h-10 rounded-full border-line px-4 text-sm">{t("home.goTo")}</a>}
                </div>
              </article>
            ))}
            {all.length === 1 && (
              <article className="rounded-3xl bg-white p-7 ring-1 ring-line">
                <h3 className="text-3xl">{t("home.hours")}</h3>
                <ul className="mt-4 space-y-3">
                  {hours.map((g) => <li key={g.days}><strong className="font-semibold">{g.days}</strong><br /><span className="text-muted">{g.ranges}</span></li>)}
                </ul>
              </article>
            )}
            {main.services.DELIVERY && main.zones.length > 0 && (
              <article className="rounded-3xl bg-white p-7 ring-1 ring-line">
                <h3 className="text-3xl">{t("home.zones")}</h3>
                <ul className="mt-4 space-y-4">
                  {main.zones.map((z) => (
                    <li key={z.id}>
                      <p className="flex flex-wrap gap-x-2 gap-y-1">
                        {[...new Set(z.areas.map((a) => a.city))].map((city, i, arr) => (
                          <span key={city}><Link href={`/livraison/${towns.find((x) => x.city === city)?.slug ?? ""}`} className="font-semibold hover:underline">{city}</Link>{i < arr.length - 1 ? "," : ""}</span>
                        ))}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {t("home.zoneMin", { lunch: money(z.minLunchCents), dinner: money(z.minDinnerCents) })}
                        {" · "}{z.feeCents ? t("home.zoneFee", { fee: money(z.feeCents) }) : t("home.zoneFree")}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link href="/livraison" className="mt-5 inline-block text-sm font-semibold underline decoration-gold decoration-2 underline-offset-4">{t("home.allTowns")}</Link>
              </article>
            )}
          </div>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section className="bg-white">
          <div className="wrap section-y grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div><p className="eyebrow">{t("home.practical")}</p><h2 className="mt-3 text-4xl sm:text-5xl">{t("faq.title")}</h2></div>
            <FaqList items={faq} />
          </div>
        </section>
      )}

      <div className="pt-16"><CtaBand title={t("home.ctaTitle")} text={t("home.ctaText")} href={orderHref} label={t("home.orderOnline")} /></div>
    </>
  );
}
