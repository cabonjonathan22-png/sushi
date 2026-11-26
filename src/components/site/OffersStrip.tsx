import type { CurrentOffer } from "@/lib/menu";

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Offres du moment (« Happy Box à 24,90 € au lieu de 35,90 € — tous les mardis »).
 * Carte cliquable : ajoute le produit (carte de commande) ou mène à la commande (accueil).
 */
export function OffersStrip({ offers, onPick, href, title = "Offres du moment", cta = "Commander" }: {
  offers: CurrentOffer[];
  /** Ajoute le plateau de l'offre au panier (une ligne, contenu figé). */
  onPick?: (offer: CurrentOffer) => void;
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
          // Prix global : somme des produits de l'offre (prix habituel barré, prix de l'offre en grand).
          const total = o.items.reduce((a, i) => a + i.priceCents, 0);
          const regularTotal = o.items.reduce((a, i) => a + i.regularPriceCents, 0);
          const first = o.bundleId;
          const body = (
            <>
              {o.image && <img src={o.image.src} srcSet={o.image.srcSet} sizes="(min-width: 640px) 40vw, 90vw" alt="" className="h-44 w-full object-cover" loading="lazy" />}
              <span className="block p-4">
                {o.badge && <span className="mb-1 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{o.badge}</span>}
                <span className="block text-2xl font-bold leading-tight">{o.title}</span>
                {o.items.length > 0 && (o.items.length > 1 || o.items[0]!.quantity > 1) && (
                  <span className="mt-2 block text-sm text-muted">
                    {o.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.name}${i.label ? ` (${i.label})` : ""}`).join(" · ")}
                  </span>
                )}
                {o.items.length > 0 && (
                  <span className="mt-2 flex flex-wrap items-baseline gap-x-3">
                    {regularTotal > total && <s className="text-lg text-muted">{eur(regularTotal)}</s>}
                    <span className="text-3xl font-extrabold text-brand-700">{eur(total)}</span>
                    {regularTotal > total && <span className="rounded-full bg-green-100 px-2 py-0.5 text-sm font-bold text-green-800">−{eur(regularTotal - total)}</span>}
                  </span>
                )}
                <span className="mt-1 block text-sm font-semibold text-brand-700">{o.when}{o.today && o.when !== "Tous les jours" ? " — aujourd'hui !" : ""}</span>
                {!o.today && o.items.length > 0 && <span className="block text-xs text-muted">Prix appliqué aux commandes prévues ce jour-là (choisissez le créneau à la validation).</span>}
                {o.zones.length > 0 && <span className="block text-sm text-muted">En livraison à {o.zones.join(", ")} uniquement (prix appliqué à la validation).</span>}
                {o.description && <span className="mt-2 block whitespace-pre-line text-sm text-muted">{o.description}</span>}
                {onPick && first && (
                  <button type="button" onClick={() => onPick(o)} className="mt-3 inline-block rounded-full bg-char px-5 py-2.5 text-sm font-bold text-paper hover:bg-ink">{cta}</button>
                )}
                {!onPick && href && first && <a href={href} className="mt-3 inline-block rounded-full bg-char px-5 py-2.5 text-sm font-bold text-paper">{cta}</a>}
              </span>
            </>
          );
          return (
            <li key={o.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line">
              {body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
