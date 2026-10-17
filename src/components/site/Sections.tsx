import Link from "next/link";
import { IconArrow } from "./icons";

/** En-tête de section : petit surtitre doré, titre serif, texte d'accompagnement. */
export function SectionHeading({ eyebrow, title, text, id, action, center }: {
  eyebrow?: string; title: string; text?: string; id?: string; action?: { href: string; label: string }; center?: boolean;
}) {
  return (
    <div className={`mb-10 flex flex-col gap-4 ${center ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"}`}>
      <div className={center ? "max-w-2xl" : "max-w-2xl"}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className="mt-3 text-4xl sm:text-5xl">{title}</h2>
        {text && <p className="mt-4 text-lg leading-relaxed text-muted">{text}</p>}
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex shrink-0 items-center gap-2 font-semibold text-char underline decoration-gold decoration-2 underline-offset-[6px] hover:decoration-char">
          {action.label}<IconArrow className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

/** Questions fréquentes en accordéon (sans JavaScript), balisées pour Google à côté. */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it) => (
        <details key={it.q} className="group py-1">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-display text-xl [&::-webkit-details-marker]:hidden">
            {it.q}
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-lg transition group-open:rotate-45">+</span>
          </summary>
          <p className="pb-5 pe-12 leading-relaxed text-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Bandeau final d'appel à l'action. */
export function CtaBand({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
  return (
    <section className="wrap pb-20 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-char px-6 py-14 text-center text-paper sm:px-12 sm:py-20">
        <div aria-hidden className="pointer-events-none absolute -end-20 -top-24 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -start-16 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
        <h2 className="relative text-4xl sm:text-6xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-paper/75">{text}</p>
        <Link href={href} className="btn-primary relative mt-8 rounded-full px-8 text-lg">{label}</Link>
      </div>
    </section>
  );
}

/** En-tête des pages intérieures : fil d'Ariane, titre, introduction. */
export function PageHero({ crumbs, eyebrow, title, text, children }: {
  crumbs: { href: string; label: string }[]; eyebrow?: string; title: string; text?: string; children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line bg-linen/50">
      <div className="wrap pb-12 pt-8 sm:pb-16 sm:pt-10">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {i < crumbs.length - 1 ? <Link href={c.href} className="hover:text-char hover:underline">{c.label}</Link> : <span aria-current="page" className="text-char">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        {eyebrow && <p className="eyebrow mt-8">{eyebrow}</p>}
        <h1 className={`${eyebrow ? "mt-3" : "mt-8"} max-w-4xl text-4xl sm:text-6xl`}>{title}</h1>
        {text && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{text}</p>}
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}
