import type { Metadata } from "next";
import { Logo } from "@/components/site/SiteChrome";
import { getSiteSettings } from "@/lib/restaurants";
import { InstallForm } from "./InstallForm";

export const metadata: Metadata = { title: "Installer un appareil", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Page à ouvrir sur l'appareil du restaurant : on tape le code donné par le back-office
 * (tablette des commandes ou ordinateur du poste d'impression). Aucun identifiant à saisir.
 */
export default async function InstallPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const brand = (await getSiteSettings()).brandName;
  const code = ((await searchParams).code ?? "").replace(/\D/g, "").slice(0, 6);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-7">
        <Logo name={brand} className="text-ink" />
        <h1 className="mt-4 text-4xl">Installer un appareil</h1>
        <p className="mt-2 text-neutral-700">Saisissez le code affiché dans le back-office (rubrique « Mon restaurant »).</p>
        <InstallForm initialCode={code} />
      </div>
    </div>
  );
}
