// Guide du back-office (CMS) : écrans annotés du back-office + fiches « pas à pas ».
import { PARTS as ALL } from "./content.mjs";

export const META = {
  title: "Guide du back-office",
  subtitle: "Utilisation du CMS au quotidien",
  brand: "Yaoma Sushi",
  version: "Version 1.0 — octobre 2026",
  coverKicker: "Back-office · CMS",
  coverText: "Prendre les commandes, tenir la carte à jour, régler le restaurant et suivre la comptabilité : chaque écran expliqué, et les gestes courants pas à pas.",
};

const part = (title) => ALL.find((p) => p.title === title);
const pick = (title, ...blocks) => part(title).blocks.filter((b) => blocks.includes(b.title));

/** Fiche pas à pas : titre, où aller, étapes, conseil éventuel. */
const howto = (title, where, steps, tip) => `<div class="howto"><h3>${title}</h3><p class="where">${where}</p><ol class="steps">${steps.map((s) => `<li><span>${s}</span></li>`).join("")}</ol>${tip ? `<p class="tip"><strong>Bon à savoir.</strong> ${tip}</p>` : ""}</div>`;

const MENU = `<table class="tbl menu-tbl">
<tr><th>Menu</th><th>À quoi ça sert</th><th>Rôles</th></tr>
<tr><td>Accueil</td><td>Chiffres du jour, pause des commandes en ligne, raccourcis.</td><td>Tous</td></tr>
<tr><td>Commandes en cours</td><td>L'écran du comptoir : nouvelles commandes, sonnerie, impression, statuts.</td><td>Tous</td></tr>
<tr><td>Historique</td><td>Toutes les commandes passées, avec filtres et recherche.</td><td>Tous</td></tr>
<tr><td>Écran cuisine</td><td>Affichage grand format pour la cuisine.</td><td>Tous</td></tr>
<tr><td>Menu & ruptures</td><td>Ruptures de stock ; pour les gérants : produits, prix, catégories.</td><td>Tous / Gérant</td></tr>
<tr><td>Codes promo</td><td>Créer et suivre les codes de réduction.</td><td>Gérant</td></tr>
<tr><td>Mon restaurant</td><td>Informations, horaires, livraison, services, paiements, impression.</td><td>Gérant</td></tr>
<tr><td>Comptabilité</td><td>Chiffre d'affaires, TVA, exports, clôtures journalières.</td><td>Gérant</td></tr>
<tr><td>Utilisateurs</td><td>Comptes de l'équipe et droits.</td><td>Propriétaire</td></tr>
<tr><td>Journal</td><td>Qui a fait quoi, et quand.</td><td>Propriétaire</td></tr>
<tr><td>Configuration</td><td>Réglages généraux : commandes, site, langues, traduction.</td><td>Propriétaire</td></tr>
<tr><td>Textes & mentions légales</td><td>Nom de l'enseigne, page d'accueil, mentions légales.</td><td>Propriétaire</td></tr>
<tr><td>Traductions</td><td>Vérifier et corriger les traductions automatiques.</td><td>Propriétaire</td></tr>
<tr><td>API & webhooks</td><td>Relier une caisse ou un service de livraison.</td><td>Propriétaire</td></tr>
</table>
<p>Chacun ne voit que les menus autorisés par son rôle. Avec plusieurs restaurants, le restaurant en cours se choisit en haut du menu.</p>`;

export const PARTS = [
  {
    title: "Prise en main",
    intro: "Le back-office est l'espace de gestion du site : il s'ouvre à l'adresse du site suivie de /admin, sur ordinateur, tablette ou téléphone.",
    blocks: [
      { type: "text", title: "Le menu du back-office", html: MENU },
      ...part("Prise en main").blocks.filter((b) => ["Qui peut faire quoi", "La vie d'une commande"].includes(b.title)),
      ...pick("Le service au quotidien", "Se connecter", "La double authentification", "L'accueil du back-office"),
    ],
  },
  {
    title: "Le service au quotidien",
    intro: part("Le service au quotidien").intro,
    blocks: part("Le service au quotidien").blocks.filter((b) => !["Se connecter", "La double authentification", "L'accueil du back-office"].includes(b.title)),
  },
  part("Gérer la carte"),
  part("Gérer le restaurant"),
  part("Comptabilité et contrôle"),
  part("Administration"),
  {
    title: "Pas à pas",
    intro: "Les gestes les plus courants, étape par étape. Chaque fiche indique où aller dans le menu.",
    blocks: [
      {
        type: "text", title: "Pendant le service",
        html: [
          howto("Accepter et suivre une commande", "Commandes en cours", [
            "Cliquez sur <strong>Activer le son</strong> en début de service (une seule fois).",
            "À la sonnerie, la commande apparaît dans <strong>Nouvelles</strong> : vérifiez l'heure, les plats et la note pour la cuisine (en jaune).",
            "Cliquez sur <strong>Acceptée →</strong> : le client est prévenu, la commande passe dans <strong>En cours</strong>.",
            "Faites-la avancer avec le même bouton : <strong>En préparation</strong>, <strong>Prête</strong> (ou <strong>En livraison</strong>), puis <strong>Terminée</strong> à la remise.",
          ], "Le ticket s'imprime tout seul si l'impression automatique est réglée ; sinon, bouton 🖨️ sur la commande."),
          howto("Refuser ou annuler une commande", "Commandes en cours → Refuser, ou fiche de la commande → Annuler la commande", [
            "Cliquez sur <strong>Refuser</strong> (commande nouvelle) ou ouvrez la fiche puis <strong>Annuler la commande</strong>.",
            "Indiquez le motif (rupture, fermeture…) : il est envoyé au client.",
            "Confirmez. Un paiement en ligne est remboursé automatiquement.",
          ], "Une commande validée ne se modifie jamais (obligation comptable) : en cas d'erreur, l'annuler et en saisir une nouvelle."),
          howto("Réimprimer un ticket", "Fiche de la commande → Ticket", [
            "Ouvrez la commande (bouton <strong>Détail</strong>, ou depuis l'Historique).",
            "<strong>Imprimer ici</strong> : sur l'imprimante de ce poste. <strong>Renvoyer aux imprimantes réseau</strong> : BizPrint, Star, Epson.",
          ]),
          howto("Noter un paiement reçu au comptoir ou à la livraison", "Fiche de la commande → Règlement reçu", [
            "Ouvrez la commande.",
            "Cliquez sur le moyen utilisé : <strong>Espèces</strong>, <strong>CB (TPE)</strong>, <strong>Titres-restaurant</strong>…",
            "Confirmez : la commande passe en « Payé » et la comptabilité est à jour.",
          ]),
          howto("Fermer les commandes en ligne pendant un coup de feu", "Accueil → Commandes en ligne", [
            "Écrivez un message pour les clients (facultatif), par exemple « Trop de commandes, retour dans 30 minutes ».",
            "Choisissez la durée : 15 min, 30 min, 1 h ou jusqu'à demain.",
            "Cliquez sur <strong>Fermer les commandes maintenant</strong>. Pour rouvrir plus tôt : <strong>Rouvrir les commandes</strong>.",
          ], "Les clients peuvent toujours consulter la carte ; le message s'affiche sur le site."),
          howto("Mettre un plat en rupture (et le remettre)", "Menu & ruptures", [
            "Tapez le nom du plat dans la recherche, ou ouvrez sa catégorie.",
            "Touchez <strong>Disponible</strong> : il passe en <strong>RUPTURE</strong> et apparaît grisé sur le site.",
            "Au retour du stock, touchez <strong>RUPTURE</strong> pour le remettre disponible.",
          ], "Pour un plat à variantes, « Ruptures par variante » permet de bloquer seulement une taille ou une cuisson."),
        ].join(""),
      },
      {
        type: "text", title: "La carte",
        html: [
          howto("Ajouter un plat", "Menu & ruptures → + Produit", [
            "Saisissez le <strong>nom</strong>, la <strong>description courte</strong> (affichée sur la carte) et, si besoin, la description détaillée.",
            "Indiquez le <strong>prix TTC</strong> et le <strong>taux de TVA</strong>.",
            "Ajoutez la <strong>photo</strong> (photo de téléphone acceptée, 8 Mo maximum).",
            "Cochez la ou les <strong>catégories</strong> et les <strong>restaurants</strong> qui le proposent.",
            "Cochez les <strong>allergènes</strong> (ou « Aucun allergène »), les <strong>badges</strong> et la disponibilité (midi, soir, retrait, livraison, sur place).",
            "Cliquez sur <strong>Enregistrer</strong> : le plat est en ligne immédiatement.",
          ]),
          howto("Changer un prix", "Menu & ruptures → Modifier (sur le plat)", [
            "Ouvrez le plat, changez le <strong>Prix TTC</strong> (ou le prix d'une variante).",
            "Pour un prix différent dans un seul restaurant : section <strong>Prix par restaurant</strong>.",
            "Enregistrez. Les commandes déjà passées gardent leur ancien prix.",
          ]),
          howto("Proposer un choix (taille, cuisson) ou des suppléments", "Fiche produit → Variantes / Options", [
            "<strong>+ Ajouter une variante</strong> pour un choix obligatoire (ex. « 6 · Frit », « 6 · Vapeur »), chacune avec son prix.",
            "<strong>+ Groupe d'options</strong> pour des suppléments (payants ou gratuits), avec un nombre de choix minimum et maximum.",
            "Enregistrez.",
          ]),
          howto("Retirer un plat de la carte", "Fiche produit → Archiver le produit", [
            "Pour un retrait temporaire : rupture, ou <strong>Retiré</strong> dans Menu & ruptures (pour ce restaurant seulement).",
            "Pour un retrait définitif : <strong>Archiver le produit</strong>. L'historique des commandes reste intact ; il peut être désarchivé plus tard.",
          ]),
          howto("Organiser les catégories", "Menu & ruptures", [
            "<strong>+ Catégorie</strong> pour en créer une ; <strong>Modifier</strong> pour la renommer ou la décrire.",
            "Glissez la poignée ⠿ pour changer l'ordre d'affichage (catégories et plats).",
            "<strong>Affichée ici / Masquée ici</strong> : afficher ou cacher la catégorie dans ce restaurant seulement.",
          ]),
        ].join(""),
      },
      {
        type: "text", title: "Le restaurant",
        html: [
          howto("Changer les horaires", "Mon restaurant → Horaires", [
            "Modifiez les plages du jour ; <strong>+ plage</strong> pour en ajouter une, ✕ pour en retirer.",
            "<strong>Copier partout</strong> recopie un jour sur toute la semaine.",
            "Cliquez sur <strong>Enregistrer les horaires</strong>.",
          ]),
          howto("Fermer un jour férié ou pour congés", "Mon restaurant → Horaires → Fermetures exceptionnelles", [
            "Choisissez les dates <strong>Du</strong> et <strong>Au (inclus)</strong>, et un motif (« Congés annuels »).",
            "Cliquez sur <strong>Ajouter</strong> : aucun créneau n'est proposé ces jours-là.",
          ], "Pensez aussi au bandeau d'annonce (Configuration → Site public) pour prévenir les clients à l'avance."),
          howto("Livrer une nouvelle commune", "Mon restaurant → Livraison", [
            "Ouvrez la zone voulue (ou <strong>+ Nouvelle zone</strong> pour d'autres conditions).",
            "Ajoutez une ligne « code postal + commune », par exemple <em>84160 Cadenet</em>.",
            "Vérifiez le minimum midi et soir, les frais et le délai, puis <strong>Enregistrer la zone</strong>.",
          ], "La commune obtient automatiquement sa page « Livraison à … » sur le site."),
          howto("Créer un code promo", "Codes promo → Nouveau code", [
            "Choisissez le <strong>code</strong> (ex. BIENVENUE), le <strong>type</strong> (pourcentage ou montant) et la <strong>valeur</strong>.",
            "Facultatif : commande minimum, dates de validité, nombre d'utilisations, restaurants concernés.",
            "Laissez <strong>Actif</strong> coché et cliquez sur <strong>Créer le code</strong>.",
          ]),
          howto("Changer la photo ou les textes de l'accueil", "Textes & mentions légales → Page d'accueil", [
            "Modifiez le surtitre, l'accroche, la présentation ou l'engagement.",
            "Choisissez une <strong>nouvelle photo d'en-tête</strong> si besoin.",
            "Cliquez sur <strong>Enregistrer</strong>.",
          ]),
        ].join(""),
      },
      {
        type: "text", title: "Équipe et comptabilité",
        html: [
          howto("Créer le compte d'un employé", "Utilisateurs → Nouveau compte", [
            "Saisissez le nom et l'e-mail, choisissez le rôle (<strong>Employé</strong> ou <strong>Gérant</strong>) et le restaurant.",
            "Cliquez sur <strong>Créer le compte</strong> : un mot de passe provisoire s'affiche une seule fois. Transmettez-le à la personne.",
            "À sa première connexion, elle le change dans <strong>Sécurité</strong>.",
          ], "Quand quelqu'un quitte l'équipe, décochez « Compte actif » : son historique reste dans le journal."),
          howto("Activer la double authentification", "Sécurité (en bas du menu)", [
            "Installez une application d'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator…).",
            "Cliquez sur <strong>Activer la double authentification</strong> et scannez le QR code avec l'application.",
            "Saisissez le code à 6 chiffres affiché, puis validez.",
          ]),
          howto("Clôturer la journée", "Comptabilité → Clôtures journalières", [
            "Après le dernier service, vérifiez que les commandes remises sont « Terminées ».",
            "Choisissez la journée et cliquez sur <strong>Clôturer la journée</strong> : les totaux sont figés.",
            "Imprimez le récapitulatif pour vos archives.",
          ]),
          howto("Envoyer les chiffres au comptable", "Comptabilité", [
            "Choisissez la période (ex. « Ce mois », ou des dates précises).",
            "Cliquez sur <strong>Export Excel (comptable)</strong> : chiffre d'affaires par jour, TVA par taux, moyens de paiement.",
          ]),
        ].join(""),
      },
    ],
  },
  {
    title: "Annexes",
    blocks: part("Annexes").blocks,
  },
];
