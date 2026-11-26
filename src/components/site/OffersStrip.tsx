import type { CurrentOffer } from "@/lib/menu";

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Offres du moment (« Happy Box à 24,90 € au lieu de 35,90 € — tous les mardis »).
 * Carte cliquable : ajoute le produit (carte de commande) ou mène à la commande (accueil).
 */
export function OffersStrip({ offers, onPick, href, title = "Offres du moment", cta = "Commander" }: {
  offers: CurrentOffer[];
  onPick?: (productId: string) => void;
  href?: string;
  title?: string;
  cta?: string;
}) {
  if (!offers.length) return null;
  return (
    <section aria-label={title} className="my-4">
      <h2 className="mb-3 text-2xl">{title}</h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {offers.map((o) => {
          const body = (
            <>
              {o.image && <img src={o.image.src} srcSet={o.image.srcSet} sizes="(min-width: 640px) 40vw, 90vw" alt="" className="h-44 w-full object-cover" loading="lazy" />}
              <span className="block p-4">
                {o.badge && <span className="mb-1 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{o.badge}</span>}
                <span className="block text-2xl font-bold leading-tight">{o.title}</span>
                {o.priceCents !== null && (
                  <span className="mt-1 block">
                    <span className="text-2xl font-extrabold text-brand-700">{eur(o.priceCents)}</span>
                    {o.regularPriceCents !== null && o.regularPriceCents > o.priceCents && (
                      <span className="ms-2 text-muted">au lieu de <s>{eur(o.regularPriceCents)}</s></span>
                    )}
                  </span>
                )}
                <span className="mt-1 block text-sm font-semibold text-brand-700">{o.when}</span>
                {o.description && <span className="mt-2 block whitespace-pre-line text-sm text-muted">{o.description}</span>}
                {(onPick || href) && o.productId && <span className="mt-3 inline-block rounded-full bg-char px-4 py-2 text-sm font-bold text-paper">{cta}</span>}
              </span>
            </>
          );
          return (
            <li key={o.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line">
              {onPick && o.productId ? (
                <button type="button" onClick={() => onPick(o.productId!)} className="block w-full text-start">{body}</button>
              ) : href && o.productId ? (
                <a href={href} className="block">{body}</a>
              ) : body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
