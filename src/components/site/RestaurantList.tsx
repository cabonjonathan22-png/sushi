import Link from "next/link";
import { IconArrow, IconPin } from "./icons";

/** Liste de restaurants en cartes (index des restaurants, choix avant de commander). */
export function RestaurantList({ restaurants, hrefFor, cta }: {
  restaurants: { id: string; slug: string; name: string; street: string; postalCode: string; city: string }[];
  hrefFor: (slug: string) => string;
  cta: string;
}) {
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {restaurants.map((r) => (
        <li key={r.id}>
          <Link href={hrefFor(r.slug)} className="group flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(31,26,23,0.35)]">
            <span className="font-display text-3xl">{r.name}</span>
            <span className="mt-3 flex gap-2 text-muted"><IconPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" />{r.street}, {r.postalCode} {r.city}</span>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">{cta}<IconArrow className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
