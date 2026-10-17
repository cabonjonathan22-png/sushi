import type { Metadata } from "next";
import { LegalPage, V } from "@/components/site/LegalPage";
import { getSiteSettings } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Conditions générales de vente", alternates: { canonical: "/cgv" } };
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function Cgv() {
  const s = await getSiteSettings();
  return (
    <LegalPage title="Conditions générales de vente">
      <h2>1. Objet</h2>
      <p>Les présentes conditions régissent les commandes passées sur ce site auprès de <V v={s.companyName} /> ({s.brandName}) pour des plats et boissons à emporter, à consommer sur place ou à livrer.</p>
      <h2>2. Commande</h2>
      <p>Le client choisit ses produits, le mode (retrait, livraison ou sur place), un créneau et un moyen de paiement, puis valide sa commande. Un e-mail de confirmation récapitule la commande. Le restaurant peut refuser ou annuler une commande (rupture, fermeture exceptionnelle, adresse hors zone…) : le client en est informé et, s'il a déjà payé en ligne, intégralement remboursé.</p>
      <h2>3. Prix</h2>
      <p>Les prix sont indiqués en euros toutes taxes comprises (TTC). Le prix facturé est celui affiché au moment de la validation, recalculé par nos services. Les frais de livraison éventuels et le minimum de commande de la zone sont indiqués avant la validation.</p>
      <h2>4. Paiement</h2>
      <p>Paiement en ligne par carte bancaire (Visa, Mastercard, CB, Apple Pay, Google Pay) via notre prestataire sécurisé Stripe, ou au retrait / à la livraison selon les moyens proposés par le restaurant (espèces, carte bancaire, titres-restaurant). Une commande payée en ligne n'est transmise au restaurant qu'après confirmation du paiement.</p>
      <h2>5. Retrait et livraison</h2>
      <p>Les créneaux sont indicatifs ; nous faisons le maximum pour les respecter. En livraison, le client s'assure d'être joignable au numéro indiqué et présent à l'adresse. La livraison n'est possible que dans les communes desservies, listées sur la page <a href="/livraison" className="underline">Livraison</a>.</p>
      <h2>6. Droit de rétractation</h2>
      <p>Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation ne s'applique pas à la fourniture de denrées susceptibles de se détériorer rapidement, ni aux prestations de restauration à une date déterminée.</p>
      <h2>7. Alcool</h2>
      <p>La vente d'alcool est réservée aux personnes majeures. Une pièce d'identité peut être demandée au retrait ou à la livraison ; à défaut, les boissons alcoolisées ne seront pas remises et seront remboursées.</p>
      <h2>8. Allergènes</h2>
      <p>La liste des allergènes est disponible sur chaque fiche produit et sur la page <a href="/allergenes" className="underline">Allergènes</a>. Nos plats sont préparés dans une cuisine où sont manipulés tous les allergènes : des traces peuvent être présentes. Signalez toute allergie dans la note de commande.</p>
      <h2>9. Réclamations</h2>
      <p>Toute réclamation doit être faite au plus vite par téléphone ou par e-mail (<V v={s.contactEmail} />). En cas de produit manquant ou non conforme, un remboursement ou un avoir peut être proposé.</p>
      <h2>10. Médiation</h2>
      <p>Conformément à l'article L612-1 du Code de la consommation, le client peut recourir gratuitement à un médiateur de la consommation : <V /> (nom et coordonnées du médiateur auquel l'entreprise adhère).</p>
      <h2>11. Données personnelles</h2>
      <p>Voir la <a href="/confidentialite" className="underline">politique de confidentialité</a>.</p>
    </LegalPage>
  );
}
