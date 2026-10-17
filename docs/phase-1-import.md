# Phase 1 — Import des données

## Décisions prises (vos réponses du 17/10/2026)

| Sujet | Décision appliquée |
|---|---|
| Nom | **Yaoma Sushi** partout (plus de « Kiyo Sushi » dans les textes du site). Les noms de produits « Kiyo Box »… sont conservés tels quels : à vous de dire si on les renomme. |
| Horaires | **Mardi → dimanche, 10h00-14h00 et 17h30-21h30** ; fermé le lundi. |
| Zones | Une zone = une liste de couples **code postal + commune**, choisis dans le back-office. Cela permet de séparer Cucuron (84160) de Cadenet (84160). Minimum de commande réglable **par restaurant** et par zone (midi / soir). |
| Caisse | On part du principe qu'une **caisse certifiée NF525 existe au restaurant** : le nouveau site affiche « à encaisser » pour les paiements sur place, et l'encaissement réel est passé sur cette caisse. |
| Impression | Toutes les imprimantes : impression navigateur (58 / 80 mm / A4) + Star CloudPRNT + Epson Server Direct Print + agent local / PrintNode pour l'ESC/POS USB. |
| « Accompagnements » | Renommé **« Les petits plus »** (catégorie spéciale proposée au panier). |

## Ce qui a été fait

- `npm run import:fetch` lit le site actuel et produit **[import/data.json](../import/data.json)**, que vous pouvez relire. Le fichier est validé par un schéma ([import/schema.ts](../import/schema.ts)) avant d'être écrit.
  - **17 catégories, 127 produits, 43 variations** avec leurs prix, ruptures (Takoyaki), badges (Végétarien) et produits avec alcool (4).
  - **Ordre du menu** repris de la page `/commander-2/`, car l'ordre WooCommerce n'est pas renseigné.
  - **126 images** téléchargées en qualité originale :
    - photos produits : WebP carrés en 160 / 320 / 640 / 1200 px ;
    - bandeaux de l'accueil : WebP en 640 / 1280 / 1920 px, proportions conservées.
    - Le nom d'origine est gardé en référence (`nomOrigine`).
  - **Restaurant** : adresse, téléphones, lien Maps, horaires, services, **2 zones** dont les communes sont rapprochées du référentiel officiel (code INSEE + code postal).
  - **Textes de l'accueil** : titre, accroche, présentation, engagement.
  - **158 redirections 301** préparées : anciennes URL `/produit/…`, `/categorie-produit/…`, `/commander-2/`, `/mon-compte/`, pages de démo.
  - De nouveaux slugs propres sont générés : `tartare-thon` (qui était la daurade) devient `tartare-daurade-avocat-mangue-sauce-yuzu`, par exemple. L'ancien slug est conservé pour les redirections.
- **Reproductible** : deux exécutions donnent un fichier identique (hors date). Tout est identifié par l'identifiant WordPress, et les images par leur empreinte. Relancer le script met à jour, sans jamais dupliquer.
- **Insertion en base** : le schéma de base de données est construit en phase 2. L'étape `import:db` lira ce `data.json` (c'est le contrat entre les deux) et sera livrée avec la phase 2.

### À relire dans `data.json` : `meta.avertissements`

1. Minimums repris du texte affiché (zone 1 : 20 € midi / 35 € soir ; zone 2 : 20 € / 40 €). WooCommerce applique aujourd'hui 50 € partout. **Lesquels sont les bons ?**
2. **TVA proposée** : 10 % (plats à emporter ou livrés), 20 % pour l'alcool. Les boissons sans alcool en contenant fermé (canettes, bouteilles) peuvent relever de 5,5 % : **à valider avec le comptable.**
3. **Box Saint-Valentin** : importée masquée.
4. **Allergènes** : vides. Ils ne sont pas publics : clé API (ci-dessous) ou saisie dans le back-office.

### Erreurs de contenu trouvées sur le site actuel (non corrigées d'office)

| Produit | Problème |
|---|---|
| Gyozas **Crevettes** | Description « Raviolis au **poulet** » |
| Poké **Chicken frit** | Description « Classique au **saumon** » |
| Maki **Saumon** | Description « Maki saumon **& avocat** » (copiée du Maki Saumon Avocat) |
| Maki Saumon Cheese | La description mentionne de la menthe, pas le nom |
| Sushi Tataki de saumon | Description « Sushi saumon » |
| Eaux | « 0,50cl » et « 0,75cl » (pour 50 cl et 75 cl) ; Eau plate 1 L à 6,50 € contre 2,60 € les 50 cl : prix à vérifier |
| Ramune | Description « Original ou litchi », variantes « Limonade / Litchi » |
| Sushi Mix | « sushi **ton** » |
| California Dreamer | Il manque le « 6 » au début de la composition |
| Créations Osaka | « sauce **rang** » (ranch ?) |
| Spring rolls | « Poulet **fris** », « **ognions fris** » |
| Kyio Box XXL | « Kyio » au lieu de « Kiyo » |
| Tartares | « sauce façon **Kiyo** » : garder ou renommer ? |
| Partout | Des points à la place des virgules (« Chou blanc émincé. sauce japonaise ») : je propose de les remplacer automatiquement par des virgules. |
| Site actuel | Le lien d'appel est faux (`tel:33…` sans « + ») : corrigé. |

Dites-moi lesquelles corriger. Je peux les appliquer dans l'import (corrections tracées), ou vous les corrigerez dans le nouveau back-office.

## La clé API REST WooCommerce (facultative mais recommandée)

Elle sert à récupérer ce que l'API publique ne donne pas : **allergènes Orderable**, **classes de TVA**, **vraies zones de livraison**, **moyens de paiement actifs**, et l'**historique des ~2 200 commandes et des clients**.

1. Connectez-vous à l'administration WordPress (`https://yaoma-sushi.com/wp-admin`) avec un compte **administrateur**.
2. Menu **WooCommerce → Réglages → onglet « Avancé » → lien « API REST »**.
3. Cliquez sur **« Ajouter une clé »**.
4. Remplissez :
   - **Description** : `Import nouveau site`
   - **Utilisateur** : votre compte administrateur
   - **Droits** : **Lecture** (surtout pas « Lecture/Écriture »)
5. Cliquez sur **« Générer une clé API »**. Deux valeurs s'affichent **une seule fois** : la **clé client** (`ck_…`) et la **clé secrète** (`cs_…`).
6. Dans le dossier du projet, copiez `.env.example` en **`.env`** et collez-les :
   ```
   WC_CONSUMER_KEY=ck_xxxxxxxx
   WC_CONSUMER_SECRET=cs_xxxxxxxx
   ```
   Le fichier `.env` est exclu du dépôt git. Évitez d'envoyer ces clés par e-mail ou dans un chat. Si vous ne pouvez pas faire autrement, révoquez la clé ensuite.
7. Après la bascule vers le nouveau site, **révoquez la clé** (même écran, « Révoquer »).

Je relancerai ensuite l'import avec `npm run import:fetch -- --commandes`. Les commandes et les clients sont écrits dans `import/private/` (données personnelles, jamais versionnées). Le catalogue, lui, est enrichi des allergènes et des réglages WooCommerce (`reglagesWoo`) pour comparaison.

## Comment tester

```bash
npm install
npm run import:fetch                    # environ 45 s ; ajouter -- --sans-images pour aller plus vite
npm test                                # 11 tests : textes, images, zones, lecture de la page de commande
npm run typecheck
```

Produits : `import/data.json` (versionné), `import/images/*.webp` et `import/cache/` (non versionnés : les images iront sur le stockage S3).

## Ce qui reste

- **Vous** : relire `data.json`, en particulier les avertissements et le tableau des erreurs ci-dessus ; trancher la règle des minimums et la TVA ; créer la clé API si possible.
- **Moi, phase 2** : schéma PostgreSQL/Prisma, étape `import:db`, authentification et rôles.
