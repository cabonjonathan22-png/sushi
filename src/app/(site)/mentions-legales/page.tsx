import type { Metadata } from "next";
import { LegalPage, V } from "@/components/site/LegalPage";
import { getPublicRestaurant, getSiteSettings, listRestaurants } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Mentions légales", alternates: { canonical: "/mentions-legales" } };
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function Mentions() {
  const s = await getSiteSettings();
  const [first] = await listRestaurants();
  const r = first ? await getPublicRestaurant(first.slug) : null;
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>
        <V v={s.companyName} /> — <V v={s.legalForm} />{s.shareCapital && ` au capital de ${s.shareCapital}`}<br />
        Siège : {r ? `${r.street}, ${r.postalCode} ${r.city}` : <V />}<br />
        SIRET : <V v={s.siret} />{s.rcs && ` — RCS ${s.rcs}`}<br />
        TVA intracommunautaire : <V v={s.vatNumber} /><br />
        Téléphone : {r?.phones.join(" / ") || <V />} — E-mail : <V v={s.contactEmail || r?.email} /><br />
        Directeur de la publication : <V v={s.publisherName} />
      </p>
      <h2>Hébergement</h2>
      <p><V v={s.hostName} /><br /><V v={s.hostAddress} /></p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes, photographies, logos et éléments graphiques de ce site sont la propriété de {s.brandName} ou utilisés avec autorisation. Toute reproduction sans accord préalable est interdite.</p>
      <h2>Alcool</h2>
      <p>L'abus d'alcool est dangereux pour la santé, à consommer avec modération. La vente d'alcool aux mineurs de moins de 18 ans est interdite (art. L3342-1 du Code de la santé publique).</p>
      <h2>Données personnelles</h2>
      <p>Voir la <a href="/confidentialite" className="underline">politique de confidentialité</a> et la <a href="/cookies" className="underline">politique cookies</a>.</p>
    </LegalPage>
  );
}
