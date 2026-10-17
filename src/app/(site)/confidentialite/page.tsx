import type { Metadata } from "next";
import { LegalPage, V } from "@/components/site/LegalPage";
import { getSiteSettings } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Politique de confidentialité", alternates: { canonical: "/confidentialite" } };
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function Privacy() {
  const s = await getSiteSettings();
  return (
    <LegalPage title="Politique de confidentialité">
      <p>Responsable du traitement : <V v={s.companyName} /> ({s.brandName}). Contact : <V v={s.contactEmail} />.</p>
      <h2>Données collectées et finalités</h2>
      <ul>
        <li><strong>Commande</strong> : nom, téléphone, e-mail, adresse de livraison, contenu de la commande, note. Finalité : préparer, livrer la commande et vous en informer (exécution du contrat).</li>
        <li><strong>Compte client</strong> (facultatif) : e-mail, mot de passe (stocké chiffré), coordonnées, adresses. Finalité : historique et commande rapide.</li>
        <li><strong>Paiement en ligne</strong> : traité directement par Stripe ; nous ne voyons ni ne conservons votre numéro de carte.</li>
        <li><strong>Sécurité</strong> : adresse IP et journaux techniques, pour prévenir la fraude et les abus (intérêt légitime).</li>
      </ul>
      <p>Aucune donnée n'est vendue ni utilisée à des fins publicitaires.</p>
      <h2>Durées de conservation</h2>
      <ul>
        <li>Commandes et pièces comptables : 10 ans (obligation légale, art. L123-22 du Code de commerce), sous forme anonymisée si vous supprimez votre compte.</li>
        <li>Compte client : jusqu'à sa suppression ; anonymisé automatiquement après 3 ans sans commande.</li>
        <li>Journal de traçabilité (actions et adresses IP associées aux commandes) : 6 ans, non modifiable (exigence de traçabilité comptable).</li>
      </ul>
      <h2>Destinataires</h2>
      <p>Le personnel du restaurant ; nos sous-traitants : hébergeur (<V v={s.hostName} />), prestataire de paiement (Stripe), service d'envoi d'e-mails. Ils sont tenus à la confidentialité et situés dans l'Union européenne ou encadrés par des garanties appropriées.</p>
      <h2>Vos droits</h2>
      <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Depuis votre <a href="/compte" className="underline">compte</a>, vous pouvez télécharger ou supprimer vos données ; sinon, écrivez-nous à <V v={s.contactEmail} />. Vous pouvez saisir la CNIL (www.cnil.fr).</p>
      <h2>Stockage local</h2>
      <p>Votre panier et, si vous l'acceptez, vos coordonnées sont mémorisés dans votre navigateur pour accélérer la commande suivante. Voir la <a href="/cookies" className="underline">politique cookies</a>.</p>
    </LegalPage>
  );
}
