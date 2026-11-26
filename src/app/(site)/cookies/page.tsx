import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Cookies", alternates: { canonical: "/cookies" } };

const ITEMS: [string, string, string][] = [
  ["ys_client", "Cookie", "Connexion à votre compte client (si vous vous connectez) — 60 jours"],
  ["ys_resto", "Cookie", "Restaurant choisi pour la commande — 1 an"],
  ["ys_lang", "Cookie", "Langue d'affichage du site que vous avez choisie — 1 an"],
  ["ys_staff, ys_admin_r", "Cookie", "Connexion du personnel au back-office et restaurant sélectionné (personnel uniquement)"],
  ["__stripe_mid, __stripe_sid", "Cookie (Stripe)", "Sécurité et prévention de la fraude lors du paiement en ligne"],
  ["ys_cart_…", "Stockage local", "Contenu de votre panier"],
  ["ys_checkout", "Stockage local", "Vos coordonnées et adresse, pour la prochaine commande sur cet appareil"],
  ["ys_cookie_notice", "Stockage local", "Mémorise que vous avez lu l'information cookies"],
];

export default function Cookies() {
  return (
    <LegalPage title="Cookies" updated="26 novembre 2026">
      <p>Ce site n'utilise <strong>que des cookies et un stockage strictement nécessaires</strong> à son fonctionnement. Il n'y a ni cookie publicitaire, ni mesure d'audience, ni réseau social : aucun consentement n'est donc requis (recommandations de la CNIL).</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2 pr-3">Nom</th><th className="py-2 pr-3">Type</th><th className="py-2">Utilité et durée</th></tr></thead>
          <tbody className="divide-y">{ITEMS.map(([n, t, u]) => <tr key={n}><td className="py-2 pr-3 font-mono">{n}</td><td className="py-2 pr-3">{t}</td><td className="py-2">{u}</td></tr>)}</tbody>
        </table>
      </div>
      <p>Ces éléments ne servent qu&apos;au fonctionnement du site : ils ne permettent ni de vous suivre sur d&apos;autres sites, ni de vous afficher de la publicité. Les données ne quittent pas votre appareil, à l&apos;exception des cookies de connexion et de sécurité du paiement, transmis à notre serveur et à Stripe lors de leur utilisation.</p>
      <p>Vous pouvez supprimer ces données à tout moment depuis les réglages de votre navigateur (rubrique « Confidentialité » ou « Cookies et données de site ») ; le panier, la langue et la connexion seront alors réinitialisés. Pour toute question : voir la <a href="/confidentialite" className="underline">politique de confidentialité</a>.</p>
    </LegalPage>
  );
}
