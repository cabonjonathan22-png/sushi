# Guide d'utilisation — Yaoma Sushi

Adresse du back-office : **https://yaoma-sushi.com/admin**. Il fonctionne sur ordinateur, tablette et téléphone.

## Se connecter

1. Saisissez votre e-mail et votre mot de passe.
2. Propriétaire : un code à 6 chiffres vous est demandé ensuite. Il s'affiche dans l'application **Google Authenticator** ou **Microsoft Authenticator** de votre téléphone (activée à la première connexion).
3. Après 5 erreurs de mot de passe, le compte est bloqué 15 minutes.

Téléphone perdu ou mot de passe oublié : un autre propriétaire ou le développeur le réinitialise dans **Utilisateurs**.

## Pendant le service : « Commandes en cours »

- Ouvrez **Commandes en cours** sur la tablette ou l'ordinateur du comptoir, puis touchez **🔔 Activer le son**. Le son se répète tant qu'une commande reste « Nouvelle ».
- Chaque commande affiche son **numéro du jour**, **RETRAIT** ou **LIVRAISON**, l'heure, le client, les produits et le paiement (**Payé** ou **À encaisser**).
- Le gros bouton orange fait passer la commande à l'étape suivante : **Acceptée → En préparation → Prête / En livraison → Terminée**. Le client reçoit un e-mail aux étapes importantes.
- **Refuser** ou **Annuler** demande un motif, envoyé au client. Une commande payée en ligne puis annulée se rembourse depuis sa fiche (**Détail**).
- **🖨️** imprime le ticket. Dans **Impression**, cochez « Imprimer automatiquement » pour que chaque nouvelle commande s'imprime seule sur cet appareil.
- **Écran cuisine** : un affichage géant pour la cuisine. Toucher une commande la fait avancer.

### Trop de monde ? Fermer les commandes

**Accueil → Fermer les commandes maintenant** (15 min, 30 min, 1 h ou jusqu'à demain), avec un message pour les clients. **Rouvrir les commandes** les réactive.

### Encaissement sur place

Quand le client paie en espèces, par carte au TPE ou en titres-restaurant, ouvrez **Détail** puis **Règlement reçu**. C'est une information de suivi : **l'encaissement se fait toujours sur la caisse enregistreuse du restaurant.**

## Le menu

**Menu & ruptures** :

- **Rupture** : touchez **Disponible**, qui devient **RUPTURE**. Le produit apparaît grisé sur le site. Les employés peuvent le faire.
- **Au menu / Retiré** : retire un produit de ce restaurant seulement.
- **Modifier** : nom, description, prix, TVA, photo (recadrée automatiquement), allergènes, badges, variantes (ex. 3 ou 6 pièces, frit ou vapeur), options payantes, disponibilité (à emporter, livraison, sur place), alcool, nombre de **petits plus offerts**.
- **Ordre** : glissez la poignée ⠿ (catégories et produits).
- **+ Produit**, **+ Catégorie**. La catégorie « Les petits plus » est proposée dans le panier avant validation.
- **Archiver** un produit le retire du menu sans toucher aux anciennes commandes.

## Mon restaurant

- **Informations** : adresse, téléphones, e-mails qui reçoivent chaque commande.
- **Horaires** : plusieurs plages par jour ; « Copier partout » pour aller vite. **Fermetures exceptionnelles** (congés, jours fériés).
- **Livraison** : une zone = une liste « code postal commune » (une par ligne). Pour chaque zone : minimum midi, minimum soir, frais, livraison offerte dès X €, délai.
- **Services & créneaux** : retrait / livraison / sur place, délai de préparation, écart entre créneaux, nombre maximum de commandes par créneau, minimum à emporter.
- **Paiements** : moyens acceptés selon le mode, clés Stripe.
- **Impression** : voir `docs/impression.md`.

## Codes promo

**Codes promo** : pourcentage, montant ou livraison offerte, avec dates, minimum de commande, nombre d'utilisations et restaurants concernés.

## Comptabilité

- **Comptabilité** : chiffre d'affaires TTC / HT / TVA par jour, semaine ou mois, par mode, par moyen de paiement et par taux de TVA ; panier moyen ; produits les plus vendus.
- **Export Excel (comptable)** : un fichier avec synthèse, détail des commandes, ventilation par jour, avoirs et produits. **Export CSV** pour les autres logiciels.
- **Clôtures journalières** : en fin de journée, **Clôturer la journée**. Les totaux sont figés et ne peuvent plus être modifiés ; **Imprimer** donne le récapitulatif à archiver.
- **Remboursement** : depuis la fiche d'une commande, total ou partiel, avec un **avoir numéroté**. Les commandes ne sont jamais modifiées ni supprimées.

## Utilisateurs et rôles

| Rôle | Peut faire |
|---|---|
| Propriétaire | Tout : restaurants, menu, compta, utilisateurs |
| Gérant | Ses restaurants : menu, horaires, zones, commandes, compta |
| Employé | Commandes de son restaurant (voir, statut, imprimer, encaissement noté) et ruptures |

Pour créer un compte : **Utilisateurs → Nouveau compte**. Un mot de passe provisoire s'affiche une seule fois : transmettez-le à la personne.

**Journal** : qui a fait quoi et quand. **Vérifier l'intégrité** contrôle que rien n'a été modifié après coup.

## Les clients

- Commande **sans compte obligatoire**.
- Compte facultatif : historique, adresses, **Commander à nouveau** en 1 clic, export et suppression de leurs données (RGPD).
- Suivi de commande en direct par le lien reçu par e-mail.
