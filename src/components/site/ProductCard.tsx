import Link from "next/link";
import type { BadgeDef } from "@/lib/config-schema";
import type { MenuProduct } from "@/lib/menu";
import { money } from "@/lib/money";
import { BadgeChip } from "./BadgeChip";

/** Carte produit de la vitrine (accueil, pages communes) : mène au plat dans la carte. */
export function ProductCard({ product: p, href, badges, fromLabel }: { product: MenuProduct; href: string; badges: BadgeDef[]; fromLabel: (price: string) => string }) {
  const price = money(p.fromPriceCents);
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 sm:rounded-3xl ring-line transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(31,26,23,0.35)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-linen">
        {p.imageLarge && (
          <img src={p.imageLarge.src} srcSet={p.imageLarge.srcSet} sizes="(min-width: 1024px) 280px, 50vw" alt={p.name}
            loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        )}
        {p.badges.length > 0 && (
          <span className="absolute start-3 top-3 flex flex-wrap gap-1">{p.badges.slice(0, 2).map((b) => <BadgeChip key={b} code={b} badges={badges} />)}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-5">
        <h3 className="font-display text-base leading-snug sm:text-xl">{p.name}</h3>
        {p.shortDescription && <p className="mt-1.5 line-clamp-2 hidden text-sm sm:block leading-relaxed text-muted">{p.shortDescription}</p>}
        <p className="mt-auto pt-3 text-sm font-semibold sm:pt-4 sm:text-base text-char">{p.variants.length > 1 ? fromLabel(price) : price}</p>
      </div>
    </Link>
  );
}
