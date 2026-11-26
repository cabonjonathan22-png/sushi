import type { Metadata } from "next";
import { LegalPage, V } from "@/components/site/LegalPage";
import { SellerIdentity } from "@/components/site/SellerIdentity";
import { readConfig } from "@/lib/config";
import { getSiteSettings } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Conditions générales de vente", alternates: { canonical: "/cgv" } };
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function Cgv() {
  const [s, config] = await Promise.all([getSiteSettings(), readConfig()]);
  const l = config.loyalty;
  return (
    <LegalPage title="Conditions générales de vente" updated="26 novembre 2026">
      <h2>1. Vendeur</h2>
      <SellerIdentity />

      <h2>2. Objet et acceptation</h2>
      <p>Les présentes conditions générales de vente (CGV) régissent les commandes passées sur ce site auprès de <V v={s.companyName} /> ({s.brandName}) pour des plats et boissons à emporter (retrait), à consommer sur place ou à livrer. La validation d&apos;une commande vaut acceptation pleine et entière des CGV en vigueur à cette date, que le client reconnaît avoir lues (case à cocher avant la validation).</p>

      <h2>3. Commande</h2>
      <p>Le client choisit ses produits et leurs options, le mode (retrait, livraison ou sur place), un créneau et un moyen de paiement, renseigne ses coordonnées, puis valide sa commande. Un e-mail de confirmation récapitule la commande et donne un lien de suivi. Les créneaux sont des plages horaires (ex. 20h00-20h30) proposées selon les horaires d&apos;ouverture et la capacité du restaurant.</p>
      <p>Le restaurant peut refuser ou annuler une commande pour un motif légitime (rupture de stock, fermeture exceptionnelle, adresse hors zone, commande anormale…) : le client en est informé et, s&apos;il a déjà payé en ligne, il est intégralement remboursé.</p>

      <h2>4. Prix</h2>
      <p>Les prix sont indiqués en euros, toutes taxes comprises (TTC, TVA au taux en vigueur selon le produit et le mode de consommation). Le prix facturé est celui affiché et recalculé par nos services au moment de la validation. Les frais de livraison éventuels et le minimum de commande de la zone sont indiqués avant la validation.</p>

      <h2>5. Offres, codes promo et petits plus</h2>
      <p>Des offres ponctuelles peuvent être proposées (prix spécial sur un produit certains jours, sur une période ou à certaines heures). Une offre s&apos;applique selon le <strong>jour et l&apos;heure du créneau choisi</strong> et dans la limite de sa période de validité ; elle peut être modifiée ou retirée à tout moment, sans effet sur les commandes déjà validées. Les codes promo sont valables selon les conditions indiquées (montant minimum, dates, nombre d&apos;utilisations) et ne sont pas cumulables entre eux, sauf mention contraire. Les compléments offerts (sauces, baguettes…) le sont dans la limite indiquée lors de la commande.</p>

      <h2>6. Paiement</h2>
      <p>Paiement en ligne par carte bancaire (CB, Visa, Mastercard, Apple Pay, Google Pay) via notre prestataire sécurisé Stripe, ou au retrait / à la livraison / sur place selon les moyens proposés par le restaurant (espèces, carte bancaire, titres-restaurant dans les conditions légales d&apos;utilisation). Une commande payée en ligne n&apos;est transmise au restaurant qu&apos;après confirmation du paiement. Nous ne conservons aucune donnée de carte bancaire.</p>

      <h2>7. Retrait, livraison et consommation sur place</h2>
      <p>Les créneaux sont respectés au mieux ; un léger retard, notamment aux heures de forte affluence ou en cas d&apos;intempéries, ne peut donner lieu à annulation ni à indemnité. En livraison, le client s&apos;assure d&apos;être joignable au numéro indiqué et présent à l&apos;adresse ; en cas d&apos;absence, la commande reste due. La livraison n&apos;est possible que dans les communes desservies, listées sur la page <a href="/livraison" className="underline">Livraison</a>. Une commande non retirée dans l&apos;heure suivant le créneau peut ne plus pouvoir être remise, pour des raisons d&apos;hygiène, sans remboursement.</p>

      <h2>8. Hygiène et conservation</h2>
      <p>Nos produits, notamment à base de poisson cru, sont à consommer rapidement après le retrait ou la livraison et à conserver au réfrigérateur (entre 0 et 4 °C) dans l&apos;intervalle. Nous déclinons toute responsabilité en cas de mauvaise conservation après la remise.</p>

      <h2>9. Droit de rétractation</h2>
      <p>Conformément à l&apos;article L221-28 du Code de la consommation, le droit de rétractation ne s&apos;applique pas à la fourniture de denrées susceptibles de se détériorer rapidement, ni aux prestations de restauration fournies à une date déterminée.</p>

      <h2>10. Alcool</h2>
      <p>La vente d&apos;alcool est interdite aux mineurs de moins de 18 ans (article L3342-1 du Code de la santé publique). Une pièce d&apos;identité peut être demandée au retrait ou à la livraison ; à défaut, les boissons alcoolisées ne seront pas remises et seront remboursées. L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer avec modération.</p>

      <h2>11. Allergènes</h2>
      <p>La liste des allergènes est disponible sur chaque fiche produit et sur la page <a href="/allergenes" className="underline">Allergènes</a>. Nos plats sont préparés dans une cuisine où sont manipulés les 14 allergènes réglementaires : des traces peuvent être présentes. Signalez toute allergie dans la note de commande et, en cas de doute, appelez le restaurant avant de commander.</p>

      {l.enabled && (
        <>
          <h2>12. Carte de fidélité</h2>
          <p>Le programme de fidélité est gratuit et réservé aux clients disposant d&apos;un compte. Chaque commande remise (terminée) rapporte {l.pointsPerEuro} point{l.pointsPerEuro > 1 ? "s" : ""} par euro payé ; les points d&apos;une commande annulée ou remboursée sont retirés. {l.expiryMonths ? `Les points expirent ${l.expiryMonths} mois après avoir été gagnés. ` : ""}Les récompenses proposées sur la page <a href="/fidelite" className="underline">Fidélité</a> s&apos;échangent contre des points, ne sont ni échangeables contre de l&apos;argent ni cessibles. Le programme peut être modifié ou arrêté à tout moment ; les clients en sont alors informés et disposent d&apos;un délai raisonnable pour utiliser leurs points.</p>
        </>
      )}

      <h2>{l.enabled ? "13" : "12"}. Réclamations et service client</h2>
      <p>Toute réclamation doit être faite au plus vite, de préférence le jour même, par téléphone ou par e-mail (<V v={s.contactEmail} />), avec le numéro de commande. En cas de produit manquant ou non conforme, un remboursement ou un avoir est proposé.</p>

      <h2>{l.enabled ? "14" : "13"}. Médiation de la consommation</h2>
      <p>Conformément aux articles L611-1 et suivants du Code de la consommation, en cas de litige non résolu avec notre service client, le client peut recourir gratuitement à un médiateur de la consommation : <V /> (nom, site internet et adresse du médiateur auquel l&apos;entreprise adhère). Le client peut également utiliser la plateforme européenne de règlement en ligne des litiges : ec.europa.eu/consumers/odr.</p>

      <h2>{l.enabled ? "15" : "14"}. Données personnelles</h2>
      <p>Voir la <a href="/confidentialite" className="underline">politique de confidentialité</a> et la <a href="/cookies" className="underline">politique cookies</a>.</p>

      <h2>{l.enabled ? "16" : "15"}. Droit applicable</h2>
      <p>Les présentes CGV sont soumises au droit français. À défaut d&apos;accord amiable ou de médiation, le litige est porté devant les juridictions compétentes dans les conditions de droit commun ; le consommateur peut saisir la juridiction de son domicile.</p>
    </LegalPage>
  );
}
