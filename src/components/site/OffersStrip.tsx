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
          const one = o.items.length === 1 ? o.items[0]! : null;
          const first = o.items[0]?.productId;
          const body = (
            <>
              {o.image && <img src={o.image.src} srcSet={o.image.srcSet} sizes="(min-width: 640px) 40vw, 90vw" alt="" className="h-44 w-full object-cover" loading="lazy" />}
              <span className="block p-4">
                {o.badge && <span className="mb-1 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{o.badge}</span>}
                <span className="block text-2xl font-bold leading-tight">{o.title}</span>
                {one && (
                  <span className="mt-1 block">
                    <span className="text-2xl font-extrabold text-brand-700">{eur(one.priceCents)}</span>
                    {one.regularPriceCents > one.priceCents && <span className="ms-2 text-muted">au lieu de <s>{eur(one.regularPriceCents)}</s></span>}
                  </span>
                )}
                {o.items.length > 1 && (
                  <span className="mt-2 block space-y-0.5">
                    {o.items.map((i) => (
                      <span key={`${i.productId}${i.label}`} className="flex justify-between gap-2 text-sm">
                        <span>{i.name}{i.label ? ` — ${i.label}` : ""}</span>
                        <span className="shrink-0"><strong className="text-brand-700">{eur(i.priceCents)}</strong>{i.regularPriceCents > i.priceCents && <s className="ms-1 text-muted">{eur(i.regularPriceCents)}</s>}</span>
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-1 block text-sm font-semibold text-brand-700">{o.when}</span>
                {o.zones.length > 0 && <span className="block text-sm text-muted">En livraison à {o.zones.join(", ")} uniquement (prix appliqué à la validation).</span>}
                {o.description && <span className="mt-2 block whitespace-pre-line text-sm text-muted">{o.description}</span>}
                {(onPick || href) && first && <span className="mt-3 inline-block rounded-full bg-char px-4 py-2 text-sm font-bold text-paper">{cta}</span>}
              </span>
            </>
          );
          return (
            <li key={o.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line">
              {onPick && first ? (
                <button type="button" onClick={() => onPick(first)} className="block w-full text-start">{body}</button>
              ) : href && first ? (
                <a href={href} className="block">{body}</a>
              ) : body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
