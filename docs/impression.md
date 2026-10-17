# Impression des tickets

Le ticket contient : nom du restaurant, **n° de commande en très gros**, **RETRAIT / LIVRAISON**, heure et jour, client et téléphone, adresse complète (livraison), produits avec variantes et options, note, remises, total, moyen de paiement, **PAYÉ / À ENCAISSER**. Avec 2 exemplaires, l'un porte « CUISINE » et l'autre « LIVREUR » (ou « COMPTOIR »).

Réglages : **Back-office → Mon restaurant → Impression**. Plusieurs imprimantes et plusieurs méthodes peuvent coexister (ex. BizPrint en cuisine et navigateur au comptoir). Chaque nouvelle commande part automatiquement vers les imprimantes marquées « Imprimer automatiquement ». **Renvoyer aux imprimantes réseau** (fiche commande) réimprime en 1 clic.

| Méthode | Matériel | PC allumé nécessaire ? |
|---|---|---|
| **BizPrint (BizSwoop)** | Toute imprimante vue par la station BizPrint (USB, réseau, A4…) | La station BizPrint (PC, Mac, Raspberry Pi ou Android) |
| **Navigateur** | Toute imprimante installée sur l'appareil | Oui, écran « Commandes en cours » ouvert |
| **Star CloudPRNT** | Star mC-Print3, TSP100IV, TSP650II CloudPRNT… | Non |
| **Epson Server Direct Print** | Epson TM-m30, TM-T88VI/VII, TM-T20III réseau… | Non |
| **Agent local** | Toute imprimante thermique ESC/POS réseau (port 9100) | Un PC ou Raspberry Pi avec Node.js |
| **PrintNode** | USB / réseau via le client PrintNode | Le PC avec le client PrintNode |

## BizPrint (BizSwoop) — votre installation actuelle

Le restaurant l'utilisait déjà avec WordPress (module « Print Manager for WooCommerce »). On garde la même station et les mêmes imprimantes :

1. Connectez-vous à **https://print.bizswoop.app**, menu **Applications**. Créez une application (ex. « Nouveau site ») et notez la **clé publique** et la **clé secrète**.
2. Back-office → **Mon restaurant → Impression → BizPrint** : collez les deux clés, puis **Enregistrer**. La liste de vos imprimantes BizPrint s'affiche avec leur **n°**.
3. **+ Nouvelle imprimante** : méthode **BizPrint**, n° d'imprimante (celui de la liste), papier (80 mm en général), exemplaires (2 = cuisine + livreur), « Imprimer automatiquement » coché.
4. Passez une commande test : le ticket sort sur l'imprimante BizPrint. Le statut (imprimé / échec) remonte dans le back-office.

Fonctionnement : le site envoie à BizPrint l'adresse d'un ticket PDF. Ce lien est signé et expire au bout de 30 minutes. La station le télécharge et l'imprime. Pensez à **désactiver l'impression côté WordPress** au moment de la bascule, pour éviter les doublons.

## Navigateur (n'importe quelle imprimante)

1. Sur l'ordinateur ou la tablette du comptoir, installez l'imprimante normalement (pilote du fabricant) et réglez le format du papier (58 ou 80 mm).
2. Ouvrez **Commandes en cours**, menu **🖨️ Impression** : choisissez le format et le nombre d'exemplaires, puis cochez **Imprimer automatiquement**.
3. **Sans fenêtre de confirmation** (Windows, recommandé) : créez un raccourci Chrome avec la cible
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://yaoma-sushi.com/admin/commandes`
   et définissez l'imprimante à tickets comme imprimante par défaut de Windows.

## Star CloudPRNT

1. Dans l'interface web de l'imprimante (son adresse IP dans un navigateur), menu **CloudPRNT** : activez-le.
2. **Server URL** : l'adresse affichée dans le back-office (`https://…/api/print/cloudprnt/<jeton>`), intervalle de 5 secondes.
3. Le jeton est secret : **Régénérer le jeton** si l'adresse a circulé.

## Epson Server Direct Print

1. Interface web de l'imprimante → **Server Direct Print** : activez-le.
2. URL : l'adresse affichée dans le back-office (`https://…/api/print/epson/<jeton>`), intervalle de 5 secondes.

## Agent local (ESC/POS réseau)

Sur un PC ou un Raspberry Pi du restaurant, avec Node.js 18 ou plus :

```
node agent/print-agent.mjs https://yaoma-sushi.com/api/print/agent/<jeton> 192.168.1.50
```

`192.168.1.50` est l'adresse IP de l'imprimante. Pour un démarrage automatique sous Windows : Planificateur de tâches → « Au démarrage » → programme `node`, avec les arguments ci-dessus.

## PrintNode

Créez un compte PrintNode, installez son client sur le PC et ajoutez `PRINTNODE_API_KEY` dans la configuration du serveur. Créez une imprimante « PrintNode » avec le n° d'imprimante PrintNode.
