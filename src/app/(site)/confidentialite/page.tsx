import type { Metadata } from "next";
import { LegalPage, V } from "@/components/site/LegalPage";
import { SellerIdentity } from "@/components/site/SellerIdentity";
import { getSiteSettings } from "@/lib/restaurants";

export const metadata: Metadata = { title: "Politique de confidentialité", alternates: { canonical: "/confidentialite" } };
export const dynamic = "force-dynamic"; // données de la base (pas de pré-rendu à la compilation)

export default async function Privacy() {
  const s = await getSiteSettings();
  return (
    <LegalPage title="Politique de confidentialité" updated="26 novembre 2026">
      <p>Cette politique explique quelles données personnelles nous collectons lorsque vous utilisez ce site, pourquoi, combien de temps nous les gardons et quels sont vos droits (Règlement général sur la protection des données — RGPD — et loi Informatique et Libertés).</p>

      <h2>Responsable du traitement</h2>
      <SellerIdentity />

      <h2>Données collectées et finalités</h2>
      <ul>
        <li><strong>Commande</strong> : nom, téléphone, e-mail, adresse de livraison, contenu de la commande, note pour la cuisine, créneau. Finalité : préparer et remettre ou livrer la commande, vous en informer par e-mail (exécution du contrat).</li>
        <li><strong>Compte client</strong> (facultatif) : e-mail, mot de passe (stocké sous forme chiffrée, illisible), coordonnées, adresses. Finalité : historique et commande rapide (exécution du contrat).</li>
        <li><strong>Carte de fidélité</strong> : n° de carte, points gagnés et utilisés. Finalité : vous faire bénéficier du programme de fidélité (exécution du contrat).</li>
        <li><strong>Paiement en ligne</strong> : traité directement par Stripe ; nous ne voyons ni ne conservons votre numéro de carte.</li>
        <li><strong>Comptabilité</strong> : commandes, paiements et avoirs (obligation légale).</li>
        <li><strong>Sécurité</strong> : adresse IP et journaux techniques, pour prévenir la fraude et les abus (intérêt légitime).</li>
      </ul>
      <p>Aucune donnée n&apos;est vendue, louée ni utilisée à des fins publicitaires ; il n&apos;y a pas de profilage ni de décision automatisée.</p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>Commandes et pièces comptables : 10 ans (obligation légale, article L123-22 du Code de commerce), sous forme anonymisée si vous supprimez votre compte.</li>
        <li>Compte client : jusqu&apos;à sa suppression ; anonymisé automatiquement après 3 ans sans commande.</li>
        <li>Points de fidélité : selon la durée de validité indiquée dans les CGV ; supprimés avec le compte.</li>
        <li>Journal de traçabilité (actions et adresses IP liées aux commandes) : 6 ans, non modifiable (traçabilité comptable).</li>
      </ul>

      <h2>Destinataires et sous-traitants</h2>
      <p>Vos données sont accessibles au seul personnel du restaurant habilité et à nos sous-traitants techniques, tenus à la confidentialité :</p>
      <ul>
        <li>Hébergement du site : <V v={s.hostName} /> ({s.hostAddress || "adresse à compléter"}) ;</li>
        <li>Base de données : Neon (serveurs situés dans l&apos;Union européenne, Francfort) ;</li>
        <li>Paiement en ligne : Stripe ;</li>
        <li>Envoi des e-mails de commande : Google (Gmail) ;</li>
        <li>Stockage des photos du menu : Cloudflare (aucune donnée personnelle).</li>
      </ul>
      <p>Certains de ces prestataires sont établis aux États-Unis : les transferts sont encadrés par le cadre de protection des données UE–États-Unis (Data Privacy Framework) et/ou par les clauses contractuelles types de la Commission européenne.</p>

      <h2>Vos droits</h2>
      <p>Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité de vos données, ainsi que du droit de définir des directives sur leur sort après votre décès. Depuis votre <a href="/compte" className="underline">compte</a>, vous pouvez télécharger ou supprimer vos données ; sinon, écrivez-nous à <V v={s.contactEmail} /> (une réponse vous est apportée sous un mois). Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (www.cnil.fr).</p>

      <h2>Sécurité</h2>
      <p>Le site est servi exclusivement en connexion chiffrée (HTTPS) ; les mots de passe sont chiffrés, les accès du personnel sont protégés et tracés, et les clés des prestataires sont conservées chiffrées.</p>

      <h2>Cookies et stockage local</h2>
      <p>Votre panier, votre langue et, si vous l&apos;acceptez, vos coordonnées sont mémorisés dans votre navigateur pour faciliter la commande. Seuls des cookies strictement nécessaires sont utilisés : voir la <a href="/cookies" className="underline">politique cookies</a>.</p>
    </LegalPage>
  );
}
