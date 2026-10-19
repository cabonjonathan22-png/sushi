import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/site/SiteChrome";
import { adminContext } from "@/lib/admin";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getSiteSettings } from "@/lib/restaurants";
import { logoutAction } from "../(auth)/actions";
import { switchRestaurantAction } from "./actions";

export const metadata: Metadata = { title: { default: "Back-office", template: "%s · Back-office" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; perm?: Permission; icon: string }[] = [
  { href: "/admin", label: "Accueil", icon: "🏠" },
  { href: "/admin/commandes", label: "Commandes en cours", perm: "orders.view", icon: "🛎️" },
  { href: "/admin/commandes/historique", label: "Historique", perm: "orders.view", icon: "🗂️" },
  { href: "/admin/cuisine", label: "Écran cuisine", perm: "orders.view", icon: "👨‍🍳" },
  { href: "/admin/menu", label: "Menu & ruptures", perm: "stock.toggle", icon: "📋" },
  { href: "/admin/promos", label: "Codes promo", perm: "promos.edit", icon: "🏷️" },
  { href: "/admin/fidelite", label: "Fidélité", perm: "promos.edit", icon: "⭐" },
  { href: "/admin/restaurant", label: "Mon restaurant", perm: "restaurant.settings", icon: "⚙️" },
  { href: "/admin/compta", label: "Comptabilité", perm: "accounting.view", icon: "📊" },
  { href: "/admin/utilisateurs", label: "Utilisateurs", perm: "users.manage", icon: "👥" },
  { href: "/admin/journal", label: "Journal", perm: "audit.view", icon: "📜" },
  { href: "/admin/configuration", label: "Configuration", perm: "tech.config", icon: "🎛️" },
  { href: "/admin/reglages", label: "Textes & mentions légales", perm: "tech.config", icon: "🛠️" },
  { href: "/admin/traductions", label: "Traductions", perm: "tech.config", icon: "🌍" },
  { href: "/admin/api", label: "API & webhooks", perm: "tech.config", icon: "🔌" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff, restaurants, current } = await adminContext();
  const brand = (await getSiteSettings()).brandName;
  const items = NAV.filter((n) => !n.perm || can(staff.actor, n.perm, current?.id));

  const nav = (
    <nav aria-label="Back-office" className="grid gap-1">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold text-neutral-200 hover:bg-white/10 hover:text-white">
          <span aria-hidden className="w-6 text-center">{n.icon}</span>{n.label}
        </Link>
      ))}
    </nav>
  );

  const account = (
    <div className="mt-6 border-t border-white/10 pt-4 text-sm text-neutral-300">
      <p className="font-semibold text-white">{staff.user.name}</p>
      <p>{ROLE_LABELS[staff.user.role]}</p>
      <div className="mt-2 flex gap-3">
        <Link href="/admin/securite" className="underline">Sécurité</Link>
        <form action={logoutAction}><button className="underline">Déconnexion</button></form>
      </div>
    </div>
  );

  const switcher = restaurants.length > 1 && (
    <form action={switchRestaurantAction} className="mb-4">
      <label htmlFor="resto" className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">Restaurant</label>
      <div className="flex gap-2">
        <select id="resto" name="restaurantId" defaultValue={current?.id} className="min-h-10 w-full rounded-lg bg-white/10 px-2 text-white">
          {restaurants.map((r) => <option key={r.id} value={r.id} className="text-ink">{r.name}</option>)}
        </select>
        <button className="rounded-lg bg-white/15 px-3 text-sm text-white">OK</button>
      </div>
    </form>
  );

  return (
    <div className="min-h-dvh bg-neutral-100 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden bg-ink p-4 lg:block">
        <div className="sticky top-4">
          <Link href="/admin" className="mb-6 block"><Logo name={brand} className="text-white" /></Link>
          {switcher}
          {nav}
          {account}
        </div>
      </aside>
      {/* Téléphone / tablette : menu repliable */}
      <header className="sticky top-0 z-40 bg-ink text-white lg:hidden">
        <details className="group">
          <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4">
            <Logo name={brand} className="text-2xl text-white" />
            <span className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold">{current ? current.name : "Menu"} ☰</span>
          </summary>
          <div className="max-h-[80dvh] overflow-y-auto p-4 pt-0">{switcher}{nav}{account}</div>
        </details>
      </header>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
