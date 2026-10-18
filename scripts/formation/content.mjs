// Contenu du guide de formation. Chaque écran : capture, texte, légende (dans l'ordre des repères), conseils.
export const META = {
  title: "Guide de formation",
  subtitle: "Site de commande en ligne et back-office",
  brand: "Yaoma Sushi",
  version: "Version 1.0 — octobre 2026",
};

export const PARTS = [
  {
    title: "Prise en main",
    intro: "Ce guide accompagne le patron, les gérants et l'équipe. Il présente le site vu par vos clients, puis le back-office, du service au quotidien jusqu'aux réglages. Chaque capture porte des repères numérotés, expliqués juste en dessous.",
    blocks: [
      {
        type: "text",
        title: "Les deux espaces",
        html: `<table class="tbl">
<tr><th>Espace</th><th>Adresse</th><th>Pour qui</th></tr>
<tr><td><strong>Site public</strong></td><td>www.yaoma-sushi.com</td><td>Vos clients : carte, commande, suivi, compte client.</td></tr>
<tr><td><strong>Back-office</strong></td><td>www.yaoma-sushi.com/admin</td><td>Vous et votre équipe : commandes, cuisine, carte, réglages, comptabilité.</td></tr>
</table>
<p>Le back-office fonctionne sur ordinateur, tablette et téléphone. Au comptoir, une tablette ou un ordinateur reste ouvert sur <strong>Commandes en cours</strong> : il sonne et imprime à chaque nouvelle commande.</p>`,
      },
      {
        type: "text",
        title: "Qui peut faire quoi",
        html: `<table class="tbl">
<tr><th>Rôle</th><th>Accès</th></tr>
<tr><td><strong>Propriétaire</strong> (super-admin)</td><td>Tout : restaurants, carte, comptabilité, utilisateurs, configuration. Double authentification obligatoire.</td></tr>
<tr><td><strong>Gérant</strong></td><td>Ses restaurants : carte, horaires, zones, commandes, comptabilité.</td></tr>
<tr><td><strong>Employé</strong></td><td>Commandes en cours, écran cuisine et ruptures de stock de son restaurant.</td></tr>
</table>
<p class="tip"><strong>Bon à savoir.</strong> Chaque action (connexion, changement de statut, modification de prix…) est enregistrée dans le <strong>Journal</strong> avec son auteur et l'heure.</p>`,
      },
      {
        type: "text",
        title: "La vie d'une commande",
        html: `<table class="tbl">
<tr><th>Statut</th><th>Signification</th><th>Qui le déclenche</th></tr>
<tr><td><span class="st st-new">Nouvelle</span></td><td>La commande vient d'arriver : sonnerie et impression.</td><td>Le client</td></tr>
<tr><td><span class="st">Acceptée</span></td><td>Vous l'avez vue et validée. Le client reçoit un e-mail.</td><td>Comptoir</td></tr>
<tr><td><span class="st">En préparation</span></td><td>En cuisine.</td><td>Cuisine</td></tr>
<tr><td><span class="st">Prête</span> / <span class="st">En livraison</span></td><td>À retirer, ou partie avec le livreur.</td><td>Cuisine / comptoir</td></tr>
<tr><td><span class="st st-ok">Terminée</span></td><td>Remise au client.</td><td>Comptoir</td></tr>
<tr><td><span class="st st-ko">Annulée</span></td><td>Refusée ou annulée, avec un motif. Le paiement en ligne est remboursé.</td><td>Comptoir / gérant</td></tr>
</table>
<p>Le client suit ces étapes en direct sur sa page de suivi. Une commande payée en ligne n'arrive au restaurant qu'une fois le paiement confirmé.</p>`,
      },
    ],
  },
  {
    title: "Le site vu par vos clients",
    intro: "Connaître le parcours du client vous permet de répondre à ses questions au téléphone. Le site s'affiche automatiquement dans la langue de son téléphone ou de son ordinateur.",
    blocks: [
      {
        img: "site-accueil",
        title: "La page d'accueil",
        text: "La vitrine du restaurant : photo, nom, horaires et accès direct à la commande.",
        legend: [
          "Menu du site : la carte, la livraison, et Nos restaurants s'il y en a plusieurs.",
          "Choix de la langue. Sans action du client, le site prend la langue de son appareil.",
          "Bouton Commander, toujours visible en haut de chaque page.",
          "Accès direct à la commande en ligne.",
          "État en temps réel : ouvert, fermé (« commandez pour plus tard ») ou commandes en pause.",
          "Rappel des horaires d'ouverture.",
        ],
        tips: ["La photo, le surtitre et l'accroche se modifient dans <strong>Textes & mentions légales → Page d'accueil</strong>."],
      },
      {
        img: "site-incontournables",
        title: "Nos incontournables",
        text: "Une sélection de plats mise en avant sur l'accueil. Un clic sur un plat ouvre la carte à la bonne catégorie.",
        legend: [
          "La sélection : les produits portant le badge « Populaire » ou « Coup de cœur ». Sans badge, le premier plat de chaque catégorie s'affiche.",
          "Lien vers la carte complète.",
          "Une carte produit : photo, nom, description courte et prix.",
        ],
        tips: ["Pour choisir les plats mis en avant, cochez le badge <strong>Populaire</strong> ou <strong>Coup de cœur</strong> dans la fiche produit."],
      },
      {
        img: "site-services",
        title: "Les modes de commande",
        text: "Les services proposés (à emporter, livraison, sur place) correspondent à ce qui est activé pour le restaurant.",
        legend: ["À emporter : le client choisit son heure de retrait.", "Livraison : la liste des communes livrées, avec minimum et frais."],
      },
      {
        img: "site-commune",
        title: "Une page par commune livrée",
        text: "Chaque commune de vos zones a sa propre page (« Livraison à Cadenet »). Ces pages aident Google à proposer votre restaurant aux habitants de chaque commune. Elles se créent automatiquement à partir des zones de livraison.",
        legend: [
          "Fil d'Ariane, repris par Google dans ses résultats.",
          "Titre de la page, propre à chaque commune.",
          "Minimum de commande, frais et délai, tirés de la zone.",
          "Commande directe pour cette commune.",
        ],
      },
      {
        img: "site-carte",
        title: "La carte et la commande",
        text: "La carte se parcourt par catégories. Un plat en rupture apparaît grisé et ne peut pas être commandé.",
        legend: [
          "Recherche d'un plat (nom, ingrédient, « végétarien »…).",
          "Catégories : un clic fait défiler la carte jusqu'à la catégorie.",
          "Bouton + : ajoute le plat au panier, ou ouvre ses choix s'il a des variantes ou des options.",
          "Panier, toujours visible sur ordinateur. Sur téléphone, un bouton « Voir le panier » apparaît en bas de l'écran.",
        ],
      },
      {
        img: "site-fiche-produit",
        title: "La fiche d'un plat",
        legend: [
          "Nom et description du plat.",
          "Choix obligatoire (taille, cuisson…) avec le prix de chaque variante.",
          "Allergènes du plat (14 allergènes réglementaires).",
          "Quantité et ajout au panier. Le bouton reste grisé tant qu'un choix obligatoire manque.",
        ],
      },
      {
        img: "site-panier",
        title: "Le panier",
        legend: [
          "Chaque ligne se modifie (− / +) ou se retire.",
          "Les petits plus (sauces, baguettes…) proposés au moment de commander.",
          "Sous-total. Les frais de livraison et le minimum sont calculés à l'étape suivante.",
          "Passage à la validation.",
        ],
      },
      {
        img: "site-validation",
        title: "La validation de la commande",
        text: "Une seule page, en quatre étapes. Le prix est entièrement recalculé par le serveur : un client ne peut pas modifier un prix.",
        legend: [
          "Comment ? Retrait, livraison ou sur place. En livraison, l'adresse est vérifiée : la commune doit faire partie d'une zone, et le minimum de la zone s'applique.",
          "Quand ? Jour et heure. Seuls les créneaux disponibles sont proposés (horaires, fermetures, délai de préparation, nombre maximum de commandes par créneau).",
          "Coordonnées du client et précision éventuelle pour la cuisine (allergie…).",
          "Moyen de paiement : en ligne par carte, ou au retrait / à la livraison (espèces, carte, titres-restaurant), selon vos réglages.",
          "Récapitulatif, code promo, acceptation des CGV, puis validation.",
        ],
        tips: ["Si le client indique une allergie, elle s'affiche en jaune sur la commande, sur l'écran cuisine et sur le ticket."],
      },
      {
        img: "site-suivi",
        title: "La page de suivi",
        text: "Après la validation, le client arrive sur sa page de suivi et reçoit le lien par e-mail. La page se met à jour toute seule.",
        legend: ["Numéro du jour, à rappeler au comptoir.", "Avancement de la commande, statut par statut.", "Détail : plats, remises, frais, total et moyen de paiement."],
      },
      {
        img: "site-compte-connexion",
        title: "Le compte client (facultatif)",
        text: "Le client peut commander sans compte. Le compte lui permet de retrouver ses commandes et ses adresses, et de recommander en un clic.",
        legend: ["Connexion avec e-mail et mot de passe.", "Création de compte ou mot de passe oublié : un lien est envoyé par e-mail."],
      },
      {
        img: "site-compte",
        title: "Mon compte",
        legend: [
          "Historique des commandes, avec le bouton « Commander à nouveau ».",
          "Coordonnées et adresses enregistrées.",
          "RGPD : téléchargement de toutes ses données, ou suppression du compte (les montants restent en comptabilité, sans nom ni adresse).",
        ],
        tips: ["Compte de démonstration : <strong>demo@yaoma-sushi.com</strong>. Son mot de passe vous a été communiqué séparément."],
      },
      {
        row: ["mobile-accueil", "mobile-menu", "mobile-carte"],
        title: "Sur téléphone",
        text: "La majorité des commandes se passent sur téléphone : tout le site est conçu pour un écran étroit.",
        legend: [
          "Le menu s'ouvre avec ce bouton.",
          "Commander, toujours accessible.",
          "Liens du menu.",
          "Choix de la langue.",
          "Catégories, à faire défiler du doigt.",
          "Le panier s'ouvre depuis le bas de l'écran.",
        ],
      },
      {
        img: "site-allergenes",
        title: "La page Allergènes",
        text: "Obligatoire : le tableau des 14 allergènes réglementaires pour chaque plat, construit automatiquement depuis les fiches produit.",
        legend: ["Légende numérotée des 14 allergènes.", "Un tableau par catégorie. « ? » signale un plat dont les allergènes ne sont pas encore renseignés."],
        warn: ["Les allergènes ont été préremplis d'après les recettes classiques. <strong>Vérifiez-les plat par plat</strong> avec vos fiches techniques et les étiquettes de vos fournisseurs (sauces, panures) : vous en êtes responsable."],
      },
    ],
  },
  {
    title: "Le service au quotidien",
    intro: "Ce qu'il faut savoir pour tenir le comptoir et la cuisine pendant le service.",
    blocks: [
      {
        img: "admin-connexion",
        title: "Se connecter",
        legend: ["Votre e-mail.", "Votre mot de passe (10 caractères minimum).", "Connexion."],
        tips: ["Après 5 essais ratés, le compte se bloque quelques minutes. En cas d'oubli, le propriétaire génère un mot de passe provisoire dans <strong>Utilisateurs</strong>."],
      },
      {
        img: "admin-code",
        title: "La double authentification",
        text: "Le propriétaire (et tout compte qui l'a activée) saisit en plus un code à 6 chiffres, donné par une application d'authentification sur son téléphone : Google Authenticator, Microsoft Authenticator, 2FAS…",
        legend: ["Le code affiché dans l'application, qui change toutes les 30 secondes.", "Validation."],
        warn: ["Si vous changez de téléphone, transférez d'abord vos comptes dans l'application d'authentification. Sinon, l'accès au compte propriétaire est perdu."],
      },
      {
        img: "admin-accueil",
        title: "L'accueil du back-office",
        legend: [
          "Menu : chacun ne voit que les écrans autorisés par son rôle.",
          "Les chiffres du jour : commandes en cours, commandes et chiffre d'affaires.",
          "Coup de feu ou imprévu : fermez les commandes en ligne pour 15 min, 30 min, 1 h ou jusqu'à demain, avec un message affiché aux clients.",
          "Raccourci vers les ruptures de stock.",
          "Sécurité : changer son mot de passe, gérer la double authentification.",
        ],
      },
      {
        img: "admin-commandes",
        title: "Commandes en cours",
        text: "L'écran principal du comptoir. Il se met à jour en direct : la pastille « En direct » le confirme.",
        legend: [
          "Activer le son, à faire une fois à l'ouverture (le navigateur l'exige). La sonnerie se répète tant qu'une commande reste « Nouvelle ».",
          "Réglages d'impression de ce poste (voir page suivante).",
          "Trois colonnes : Nouvelles, En cours, Prêtes / en livraison.",
          "Une commande : numéro du jour, mode (bleu = livraison), heure souhaitée, client, plats, note pour la cuisine et somme à encaisser.",
          "Bouton principal : passe à l'étape suivante (Acceptée → En préparation → Prête…).",
          "Imprimer le ticket.",
          "Ouvrir la fiche complète.",
          "Refuser (rupture, fermeture…) : un motif est demandé et le client est prévenu.",
        ],
      },
      {
        img: "admin-impression-poste",
        title: "L'impression sur ce poste",
        text: "Pour une imprimante branchée sur l'ordinateur ou la tablette du comptoir.",
        legend: ["Impression automatique des nouvelles commandes, format (ticket 58 mm, 80 mm ou feuille A4) et nombre d'exemplaires."],
        tips: ["Avec BizPrint, une imprimante Star ou Epson réseau, les tickets sortent même quand aucun écran n'est ouvert (voir <strong>Mon restaurant → Impression</strong>)."],
      },
      {
        img: "admin-fiche-commande",
        title: "La fiche d'une commande",
        legend: [
          "Numéro du jour, mode, statut et référence unique (YS-CUC-…).",
          "Changer le statut. Le client est prévenu par e-mail selon vos réglages.",
          "Imprimer le ticket ici, voir un aperçu, ou le renvoyer aux imprimantes réseau.",
          "Règlement reçu : indiquez comment le client a payé au retrait ou à la livraison.",
          "Annuler la commande, avec un motif. Un paiement en ligne est remboursé automatiquement.",
        ],
        tips: ["L'historique en bas de fiche trace chaque changement : qui, quand, de quel statut à quel statut."],
      },
      {
        img: "admin-cuisine",
        title: "L'écran cuisine",
        text: "Pour une tablette ou un écran en cuisine : grands caractères, fond sombre, commandes triées par heure.",
        legend: [
          "Une commande. Toucher le bas de la carte la fait passer à l'étape suivante.",
          "Note du client (allergie, sans sésame…) en jaune.",
          "Activer le son.",
          "Plein écran.",
        ],
      },
      {
        img: "admin-historique",
        title: "L'historique",
        legend: ["Filtres : dates, statut, mode, moyen de paiement, recherche par nom, téléphone ou numéro.", "Toutes les commandes, y compris celles de l'ancien site.", "Un clic ouvre la fiche."],
      },
      {
        img: "admin-menu",
        title: "Rupture de stock en un geste",
        text: "Plus de saumon ? Ouvrez <strong>Menu & ruptures</strong> et touchez le bouton du plat.",
        legend: [
          "Recherche d'un produit.",
          "Les catégories s'ouvrent d'un clic.",
          "Disponible / RUPTURE : le plat apparaît grisé sur le site, sans pouvoir être commandé. Les plats à variantes ont aussi une rupture par variante.",
          "Au menu / Retiré : le plat est proposé ou non dans CE restaurant.",
          "Ajouter un produit.",
        ],
        tips: ["La rupture ne concerne que le restaurant sélectionné. Pensez à remettre le plat <strong>Disponible</strong> au retour du stock."],
      },
    ],
  },
  {
    title: "Gérer la carte",
    intro: "Produits, prix, photos, variantes, options, allergènes et badges. La carte est commune à tous les restaurants, mais chacun peut masquer une catégorie ou retirer un plat.",
    blocks: [
      {
        img: "admin-produit",
        title: "La fiche produit",
        legend: [
          "Nom, description courte (affichée sur la carte) et description détaillée.",
          "Prix TTC et taux de TVA (10 % à emporter ou livré, 5,5 % ou 20 % selon le produit).",
          "Restaurants qui proposent ce plat, disponibilité midi / soir et modes (retrait, livraison, sur place).",
          "Les 14 allergènes. Cochez « Aucun allergène » pour un plat qui n'en contient aucun : sans case cochée, le site affiche « information disponible au restaurant ».",
          "Enregistrer.",
        ],
        tips: [
          "<strong>Variantes</strong> : un choix obligatoire (3 ou 6 pièces, frit ou vapeur), chacune avec son prix. <strong>Options</strong> : suppléments payants ou gratuits.",
          "<strong>Photo</strong> : JPEG, PNG ou photo de téléphone, 8 Mo maximum. Elle est recadrée et optimisée automatiquement.",
        ],
      },
    ],
  },
  {
    title: "Gérer le restaurant",
    intro: "Tout se trouve dans <strong>Mon restaurant</strong>, un onglet par sujet. Avec plusieurs restaurants, choisissez d'abord le restaurant en haut du menu.",
    blocks: [
      {
        img: "admin-restaurant-infos",
        title: "Informations",
        legend: ["Les onglets de Mon restaurant.", "Nom, adresse, téléphones, lien Google Maps et présentation.", "E-mails qui reçoivent chaque nouvelle commande (en secours de l'écran)."],
      },
      {
        img: "admin-restaurant-horaires",
        title: "Horaires et fermetures",
        legend: [
          "Onglet Horaires.",
          "Une ou plusieurs plages par jour. « Copier partout » recopie un jour sur toute la semaine. Les plages avant 16 h comptent comme « midi ».",
          "Fermetures exceptionnelles (congés, jours fériés) : aucune commande ces jours-là.",
        ],
      },
      {
        img: "admin-restaurant-livraison",
        title: "Zones de livraison",
        text: "Une zone regroupe des communes (code postal + commune) qui partagent les mêmes conditions.",
        legend: [
          "Onglet Livraison.",
          "Une zone, ouverte pour modification.",
          "Les communes de la zone, une par ligne : « 84160 Cadenet ».",
          "Minimum de commande midi et soir, frais, livraison offerte dès un montant, délai indicatif.",
          "Créer une nouvelle zone.",
        ],
        tips: ["Une commune ajoutée à une zone obtient automatiquement sa page « Livraison à … » sur le site."],
      },
      {
        img: "admin-restaurant-services",
        title: "Services et créneaux",
        legend: [
          "Onglet Services & créneaux.",
          "Services proposés, alcool en livraison, visibilité du restaurant. En dessous : délai de préparation, intervalle entre créneaux, nombre maximum de commandes par créneau, jours de commande à l'avance et minimum à emporter.",
        ],
      },
      {
        img: "admin-restaurant-paiements",
        title: "Paiements",
        legend: [
          "Onglet Paiements.",
          "Moyens acceptés pour chaque mode (retrait, livraison, sur place).",
          "Stripe : vos clés pour le paiement en ligne. La clé secrète est chiffrée et n'est plus jamais réaffichée.",
        ],
      },
      {
        img: "admin-restaurant-impression",
        title: "Impression",
        text: "Toutes les imprimantes sont prises en charge : navigateur (n'importe quelle imprimante du poste), BizPrint (le service utilisé jusqu'ici), Star CloudPRNT, Epson Server Direct Print, PrintNode et agent local ESC/POS.",
        legend: [
          "Onglet Impression.",
          "BizPrint : collez les clés de l'application (print.bizswoop.app → Applications). La station BizPrint du restaurant imprime alors les tickets.",
          "Une imprimante existante : méthode, papier, nombre d'exemplaires, impression automatique.",
          "Ajout d'une imprimante : choisissez la méthode adaptée à votre matériel.",
        ],
        tips: ["Le guide <strong>docs/impression.md</strong> détaille l'installation de chaque type d'imprimante."],
      },
      {
        img: "admin-promos",
        title: "Codes promo",
        legend: ["Nouveau code : pourcentage ou montant, commande minimum, dates de validité, nombre d'utilisations, restaurants concernés."],
      },
    ],
  },
  {
    title: "Comptabilité et contrôle",
    intro: "Les montants sont calculés au centime près et ne peuvent plus être modifiés une fois la commande passée. Les journées clôturées sont figées et chaînées entre elles.",
    blocks: [
      {
        img: "admin-compta",
        title: "Comptabilité",
        legend: [
          "Période (raccourcis Aujourd'hui, Hier, 7 jours, Ce mois), regroupement par jour, semaine ou mois, et restaurant.",
          "Ventilation par taux de TVA, par mode et par moyen de paiement.",
          "Export Excel pour le comptable (ou CSV).",
        ],
      },
      {
        img: "admin-clotures",
        title: "Clôtures",
        text: "En fin de service, clôturez la journée : les totaux sont figés et chaînés aux clôtures précédentes. Une modification ultérieure serait détectée.",
        legend: ["Choisir la journée et clôturer, puis imprimer le récapitulatif pour vos archives."],
        tips: ["« Vérifier l'intégrité des clôtures » contrôle que rien n'a été modifié depuis."],
      },
      {
        img: "admin-journal",
        title: "Journal des actions",
        legend: ["Qui a fait quoi et quand : connexions, statuts, prix, ruptures, réglages. Chaque ligne est chaînée à la précédente : « Vérifier l'intégrité » détecte toute retouche."],
      },
    ],
  },
  {
    title: "Administration",
    intro: "Réservé au propriétaire : comptes, sécurité, réglages généraux, textes du site et traductions.",
    blocks: [
      {
        img: "admin-utilisateurs",
        title: "Utilisateurs",
        legend: ["Rappel des droits de chaque rôle.", "Créer un compte : nom, e-mail, rôle et restaurants. Un mot de passe provisoire s'affiche une seule fois : transmettez-le à la personne, qui le changera dans Sécurité.", "Les comptes existants : dernière connexion, double authentification, et réinitialisation du mot de passe (ou de la 2FA en cas de téléphone perdu)."],
        tips: ["Quand un employé part, <strong>désactivez</strong> son compte : son historique reste dans le journal."],
      },
      {
        img: "admin-securite",
        title: "Sécurité du compte",
        legend: ["Double authentification et changement de mot de passe."],
      },
      {
        img: "admin-configuration",
        title: "Configuration",
        text: "Tous les réglages généraux, sur une seule page.",
        legend: [
          "Services par restaurant : sur place, à emporter, livraison, visible.",
          "Commandes : acceptation automatique, e-mail obligatoire, notes cuisine, délai d'annulation des paiements non finalisés, e-mails envoyés au client à chaque statut.",
          "Site public : titre et description pour Google, pied de page, bandeau d'annonce (« Fermeture exceptionnelle le 1er mai »), réseaux sociaux, type de cuisine.",
          "Pays, devise et langues proposées aux clients, détection de la langue de l'appareil.",
          "Traduction automatique de la carte (DeepL recommandé) : clé API du service.",
          "Enregistrer.",
        ],
      },
      {
        img: "admin-reglages",
        title: "Textes & mentions légales",
        legend: ["Nom de l'enseigne et nom de la catégorie des suppléments.", "Page d'accueil : surtitre, accroche, présentation, engagement et photo d'en-tête.", "Mentions légales : raison sociale, SIRET, TVA, hébergeur… Elles alimentent les pages Mentions légales, CGV et Confidentialité."],
        warn: ["Les mentions légales sont obligatoires : complétez-les avant la mise en ligne."],
      },
      {
        img: "admin-traductions",
        title: "Traductions",
        text: "Le site s'affiche dans la langue de l'appareil du client. L'interface existe en français et en anglais ; les autres langues, ainsi que la carte, sont traduites automatiquement par le service choisi dans Configuration, puis mémorisées.",
        legend: [
          "Langue à vérifier.",
          "Traduire d'avance tout ce qui manque dans cette langue.",
          "Onglets : la carte, les textes du site, l'interface.",
          "Filtre « À faire » : textes non traduits, ou dont l'original a changé depuis.",
          "Corrigez une traduction : elle passe en « Corrigé » et ne sera plus jamais remplacée. Videz le champ pour revenir à la traduction automatique.",
        ],
      },
      {
        img: "admin-api",
        title: "API & webhooks",
        legend: ["Pour relier une caisse, un service de livraison ou un outil externe : clés API par restaurant et webhooks signés. La documentation technique est en ligne sur /api/v1/docs."],
      },
    ],
  },
  {
    title: "Annexes",
    blocks: [
      {
        type: "text",
        title: "Routine quotidienne",
        html: `<div class="check">
<h4>À l'ouverture</h4>
<ul><li>Ouvrir <strong>Commandes en cours</strong> sur le poste du comptoir et cliquer <strong>Activer le son</strong>.</li>
<li>Vérifier que l'imprimante est allumée, avec du papier (station BizPrint en ligne).</li>
<li>Passer en <strong>rupture</strong> les plats manquants du jour.</li>
<li>Vérifier les commandes passées à l'avance pour la journée.</li></ul>
<h4>Pendant le service</h4>
<ul><li>Accepter chaque nouvelle commande, puis la faire avancer jusqu'à « Terminée ».</li>
<li>En cas d'affluence, fermer les commandes en ligne 15 ou 30 minutes depuis l'accueil.</li>
<li>Noter le règlement des commandes payées sur place.</li></ul>
<h4>À la fermeture</h4>
<ul><li>Passer en « Terminée » les commandes remises.</li>
<li>Remettre <strong>Disponible</strong> les plats revenus en stock.</li>
<li><strong>Clôturer la journée</strong> dans Comptabilité → Clôtures et imprimer le récapitulatif.</li></ul></div>`,
      },
      {
        type: "text",
        title: "Que faire si…",
        html: `<table class="tbl">
<tr><th>Situation</th><th>Solution</th></tr>
<tr><td>Pas de sonnerie</td><td>Cliquer <strong>Activer le son</strong> (à refaire après chaque rechargement de la page) et vérifier le volume de l'appareil.</td></tr>
<tr><td>Pas de ticket imprimé</td><td>Imprimante allumée, papier, station BizPrint en ligne ? Sinon, ouvrir la fiche commande → <strong>Imprimer ici</strong>.</td></tr>
<tr><td>La pastille « En direct » est grise</td><td>Connexion internet coupée : l'écran se remet à jour tout seul au retour du réseau. Recharger la page si besoin.</td></tr>
<tr><td>Un client ne trouve pas sa commune</td><td>Elle n'est dans aucune zone : l'ajouter dans <strong>Mon restaurant → Livraison</strong>, ou proposer le retrait.</td></tr>
<tr><td>« Minimum de commande non atteint »</td><td>Minimum de la zone (midi / soir) : réglable par zone.</td></tr>
<tr><td>Aucun créneau proposé</td><td>Vérifier horaires, fermetures exceptionnelles, pause des commandes et nombre maximum de commandes par créneau.</td></tr>
<tr><td>Un plat ne s'affiche pas</td><td>Plat retiré ou en rupture dans ce restaurant, catégorie masquée, ou plat réservé au midi ou au soir.</td></tr>
<tr><td>Erreur sur une commande déjà validée</td><td>Une commande n'est jamais modifiée (obligation comptable) : l'annuler avec un motif et en saisir une nouvelle.</td></tr>
<tr><td>Mot de passe oublié</td><td>Le propriétaire génère un mot de passe provisoire dans <strong>Utilisateurs</strong>.</td></tr>
<tr><td>Téléphone de double authentification perdu</td><td>Le propriétaire coche « Réinitialiser aussi la 2FA » dans <strong>Utilisateurs</strong>.</td></tr>
</table>`,
      },
      {
        type: "text",
        title: "Glossaire",
        html: `<dl class="gloss">
<dt>Créneau</dt><dd>Heure de retrait ou de livraison choisie par le client, par tranches de 15 minutes (réglable).</dd>
<dt>Zone</dt><dd>Groupe de communes livrées avec les mêmes conditions (minimum, frais, délai).</dd>
<dt>Rupture</dt><dd>Plat momentanément indisponible : visible mais impossible à commander.</dd>
<dt>Petits plus</dt><dd>Sauces, baguettes, gingembre… proposés au panier, certains offerts selon les plats.</dd>
<dt>Clôture</dt><dd>Arrêt des comptes d'une journée : totaux figés et chaînés, impossibles à modifier.</dd>
<dt>Double authentification (2FA)</dt><dd>Code à 6 chiffres demandé en plus du mot de passe, donné par une application sur le téléphone.</dd>
<dt>Webhook</dt><dd>Message automatique envoyé à un autre logiciel (caisse…) à chaque nouvelle commande.</dd>
</dl>`,
      },
    ],
  },
];
