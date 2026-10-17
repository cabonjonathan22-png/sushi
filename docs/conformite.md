# Conformité (caisse, RGPD, alcool, allergènes)

## Logiciel de caisse — art. 286 I-3° bis du CGI (anti-fraude TVA)

**Décision retenue** : le restaurant dispose d'une **caisse enregistreuse certifiée** (NF525 ou LNE). Ce site **prend les commandes** et encaisse les paiements **en ligne** (Stripe, un prestataire bancaire). Les paiements **sur place** (espèces, carte au TPE, titres-restaurant) sont marqués « à encaisser » et **saisis sur la caisse certifiée**. Le bouton « Règlement reçu » du back-office n'est qu'une information de suivi.

Ce qui est en place dans le logiciel, sur les 4 principes (inaltérabilité, sécurisation, conservation, archivage) :

| Exigence | Mise en œuvre |
|---|---|
| Inaltérabilité | Une commande validée ne peut plus changer de montant, de lignes, de numéro ni de date. Ce verrou est posé **dans PostgreSQL** (déclencheurs), pas seulement dans le code. Paiements, avoirs, clôtures et journal ne peuvent être ni modifiés ni supprimés. |
| Corrections | Uniquement par annulation motivée ou **avoir numéroté** (AV-CUC-AAAA-NNNN), tracés. |
| Numérotation | Séquentielle par restaurant, **sans trou** (compteur dans la même transaction que la commande). |
| Traçabilité | Journal horodaté, **chaîné par empreintes SHA-256**, avec vérification dans le back-office. Historique de chaque changement de statut (qui, quand, motif). |
| Clôtures | Clôture journalière figée et chaînée à la précédente, avec récapitulatif imprimable et vérification d'intégrité. |
| Conservation | Rien n'est supprimé : en cas de suppression de compte (RGPD), les données personnelles sont anonymisées mais les montants restent. |

**Ce que le code seul ne garantit pas** : la **certification** par un organisme accrédité (AFNOR/Infocert NF525 ou LNE) et l'attestation qui l'accompagne. Si le restaurant voulait un jour encaisser directement dans ce logiciel (sans caisse certifiée), il faudrait :
- les clôtures mensuelles et annuelles ;
- des archives signées exportables ;
- un ticket conforme ;
- puis l'audit de certification, payant et à renouveler chaque année.

L'architecture le permet sans tout refaire. **À valider avec l'expert-comptable.**

## RGPD

- **Cookies** : uniquement des cookies nécessaires (session, panier, sécurité Stripe), sans traceur publicitaire ni mesure d'audience. Pas de consentement requis ; un bandeau informe le visiteur.
- **Droits des clients** : export JSON et suppression du compte dans « Mon compte » ; anonymisation automatique des comptes inactifs depuis 3 ans.
- **Sécurité** : mots de passe hachés (Argon2id) ; 2FA obligatoire pour le propriétaire et le super-admin ; verrouillage après échecs ; limitation de débit ; secrets chiffrés (AES-256-GCM) ; en-têtes de sécurité (CSP, HSTS) ; protection CSRF ; images ré-encodées à l'envoi.
- **À faire par le restaurant** : compléter les mentions légales (Réglages du site) ; tenir le registre des traitements ; signer le contrat de sous-traitance (DPA) avec l'hébergeur, Stripe, le service d'e-mails et BizPrint.

## Alcool

- Mention « L'abus d'alcool est dangereux pour la santé » sur les produits alcoolisés et en pied de page.
- Confirmation « 18 ans ou plus » obligatoire pour toute commande avec alcool.
- Avertissement « vérifier l'âge » sur l'écran des commandes et le ticket.
- Option « pas d'alcool en livraison » par restaurant.
- La vente d'alcool à emporter ou en livraison suppose la **licence adaptée** (licence restaurant / petite licence à emporter) : à vérifier.

## Allergènes

Les 14 allergènes réglementaires sont saisissables pour chaque produit. Ils sont affichés sur la fiche produit et dans le tableau de la page `/allergenes`. **Ils ne sont pas encore renseignés** (aucune donnée sur l'ancien site) : la page indique « information disponible au restaurant » en attendant. **Obligation légale : à compléter avant la mise en ligne.**
