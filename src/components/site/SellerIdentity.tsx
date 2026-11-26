import { V } from "@/components/site/LegalPage";
import { getSiteSettings, listRestaurants } from "@/lib/restaurants";

/** Identité du vendeur (pages légales) : société, siège, immatriculation, contacts. */
export async function SellerIdentity() {
  const [s, restaurants] = await Promise.all([getSiteSettings(), listRestaurants()]);
  const r = restaurants[0];
  return (
    <ul>
      <li><strong>Vendeur</strong> : <V v={s.companyName} />{s.legalForm ? `, ${s.legalForm}` : ""}{s.shareCapital ? ` au capital de ${s.shareCapital}` : ""}, exploitant l&apos;enseigne {s.brandName}.</li>
      {r && <li><strong>Siège et restaurant</strong> : {r.street}, {r.postalCode} {r.city}.</li>}
      <li><strong>SIRET</strong> : <V v={s.siret} />{s.rcs ? ` — ${s.rcs}` : ""}.</li>
      {s.vatNumber && <li><strong>TVA intracommunautaire</strong> : {s.vatNumber}.</li>}
      <li><strong>Contact</strong> : <V v={s.contactEmail} />{r?.phones.length ? ` — téléphone : ${r.phones.join(" / ")}` : ""}.</li>
    </ul>
  );
}
