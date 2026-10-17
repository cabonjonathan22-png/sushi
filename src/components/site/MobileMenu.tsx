"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconClose, IconMenu } from "./icons";

/** Menu du téléphone : panneau déroulant, refermé à chaque changement de page ou avec Échap. */
export function MobileMenu({ links, label, footer }: { links: { href: string; label: string }[]; label: string; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav"
        className="grid h-11 w-11 place-items-center rounded-full text-char hover:bg-linen">
        <span className="sr-only">{label}</span>
        {open ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
      </button>
      <div id="mobile-nav" hidden={!open} className="absolute inset-x-0 top-full border-b border-line bg-paper shadow-xl">
        <nav className="wrap flex flex-col py-3" aria-label={label}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-12 items-center border-b border-line/70 font-display text-2xl text-char last:border-0">
              {l.label}
            </Link>
          ))}
          {footer && <div className="flex flex-wrap items-center gap-3 py-4">{footer}</div>}
        </nav>
      </div>
    </div>
  );
}
