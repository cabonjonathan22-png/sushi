# Phase 0 — Analyse du site actuel, stack et modèle de données

Analyse faite le 17/10/2026 sur https://yaoma-sushi.com (pages publiques, CSS, Store API WooCommerce, sitemaps, API geo.api.gouv.fr pour les codes postaux).

---

## 1. Ce qui tourne aujourd'hui

| Élément | Constat |
|---|---|
| CMS | WordPress + thème Hello Elementor + Elementor Pro 3.28 |
| Commande | WooCommerce + **Orderable 1.21 + Orderable Pro 1.17** (modules : créneaux, multi-location, labels, allergènes, infos nutritionnelles, add-ons, « cart bumps ») |
| Paiement | WooPayments installé (namespace `payments/woopay`) + traces de paiement à la livraison (`cod`) — à confirmer |
| Impression | Un plugin d'impression est installé (namespace REST `zprint/v1`, « Print Manager for WooCommerce ») |
| Divers | Jetpack, Jetpack Boost, Image Optimizer, WPCode |

### Pages réellement publiées

| URL | Rôle réel |
|---|---|
| `/` | Accueil (page « Welcome », id 89) |
| `/commander-2/` | **Menu de commande** Orderable (id 7) |
| `/panier/` | Panier |
| `/commander/` | Validation de commande (checkout, id 253) |
| `/mon-compte/` | Connexion / inscription |
| `/boutique/` | Boutique WooCommerce (doublon du menu) |
| `/produit/<slug>/` (127) et `/categorie-produit/<slug>/` (17) | Fiches produit et catégories WooCommerce, indexables |
| `/accompagnements-2/` | Page « Accompagnements » |
| `/sample-page/`, `/gallery/`, `/whats-on/`, `/our-story/`, `/food-drinks/`, `/2025/04/01/hello-world/` | **Pages de démo du thème restées en ligne** et présentes dans le sitemap |

Il n'y a **aucune page légale** (`/mentions-legales/` et `/politique-de-confidentialite/` → 404), aucune meta description et aucune donnée structurée. Le `<title>` de l'accueil est « Yaoma Sushi – Restaurant de Sushi ».

### Catalogue (Store API)

- **127 produits** (et non ~110) : 115 simples, 12 variables. **17 catégories** : les 16 attendues plus **« Saint Valentin »** (1 produit : « Box Saint Valentin – Précommande pour le 14 février », 47,90 €, toujours en vente).
- **Anomalie API** : les 13 plateaux (Kiyo Box, Kyio Box XXL, Original box, Veggie Mix…) ont un champ `categories` **vide** dans la réponse produit, mais remontent bien avec le filtre `?category=25`. L'import construira donc les liens produit↔catégorie **catégorie par catégorie**, pas à partir du champ produit.
- **Ordre** : l'ordre WooCommerce (`menu_order`) n'est pas renseigné (tri alphabétique). Le vrai ordre est celui de la mise en page Orderable sur `/commander-2/`. L'import reprendra l'ordre des catégories et des produits depuis cette page.
- **Rupture** : seul **Takoyaki (x6)** est en rupture.
- **Badges** : une seule étiquette Orderable existe, « Végétarien » (vert `#3f992f`), posée sur un seul produit (**Poké Veggie**). Le « Cali Végétarien » et le « Veggie Mix » ne l'ont pas.
- **Allergènes** : le module allergènes d'Orderable Pro est installé, mais aucun allergène n'est affiché ni exposé publiquement → **ils devront être saisis** (ou lus via l'API REST authentifiée s'ils existent en base).
- **Descriptions** : 27 produits sans description courte, 1 seul avec description longue.
- **Images** : 127 images, 119 distinctes (8 partagées entre produits). Le champ `src` de l'API donne **déjà l'original** (ex. 1181×1181 px, 280 Ko) : pas besoin de deviner l'URL en retirant `-300x300`, je garderai quand même ce repli. Formats : jpg, jpeg, png.
- **Alcool** : 4 produits (Bière Asahi, Iki beer, Vins de pays, Vin du Luberon), avec la mention « L'abus d'alcool est dangereux pour la santé ».

**Variations et prix** (tous récupérés via `/wc/store/v1/products/<id_variation>`) :

| Produit | Variations |
|---|---|
| Gyozas Crevettes | Quantité 3 / 6 × Style Vapeur / Frit : 3 = 5,70 €, 6 = 9,90 € |
| Gyozas Poulet | idem : 3 = 4,90 €, 6 = 8,50 € |
| Les petits Tartares | Saumon avocat mangue 8,90 € · Crevettes avocat mangue 9,90 € · Thon avocat oignons frits 10,90 € (image propre à chaque variation) |
| Rouleaux de printemps X2 | Saumon / Poulet / Crevettes : 8,60 € |
| Nouilles au choix | Légumes 12,30 · Poulet frit 15,90 · Poulet caramélisé 15,90 · Saumon Tataki 15,90 · Bœuf 16,30 · Crevette 16,90 € |
| Ramen au choix | Légumes / Poulet / Bœuf / Saumon / Crevettes : 16,90 € |
| Mochis glacés (2 pcs) | 5 parfums : 6,00 € |
| Cheesecake Yuzu | Coulis fruits rouges / passion : 6,50 € |
| Ramune | Limonade 6,00 € · Litchi 6,20 € |
| Coca | Coca / Zéro / Cherry : 2,90 € |
| Vins de pays | Blanc / Rosé / Rouge : 18 € |
| Vin du Luberon | Blanc / Rosé / Rouge : 24 € |

Remarque : il n'y a **pas** de produit « Makis » variable : les makis sont 7 produits simples.

### Identité visuelle (CSS réel, kit Elementor)

- Couleurs : noir `#000000` (en-tête, boutons du menu), **orange `#F1562A`** (couleur d'accent), rouge brique `#CB3522`, crème `#FEF8EE` (fonds de sections), gris `#DADADA`, bleu `#0F4675` déclaré mais peu utilisé.
- Polices : **Bebas Neue** (titres condensés en capitales), **Josefin Sans** (texte, en graisse 100 : trop fine, peu lisible), plus Lora, Prompt, Poppins et Nanum Gothic chargées sans réelle cohérence (6 familles).
- Proposition : Bebas Neue pour les titres et les prix, **une seule** police de texte lisible (Josefin Sans en 400 minimum, ou Inter), noir / orange / crème. Le contraste du blanc sur `#F1562A` est d'environ 3,2:1, insuffisant pour du texte courant : texte noir sur orange, ou orange un peu plus sombre (`#D9441B`) pour les boutons à texte blanc.

---

## 2. Incohérences relevées

1. **Nom** : « Yaoma Sushi » (titre, en-tête) contre « KIYO SUSHI » (pied de page, plateaux « Kiyo Box », « Kyio Box XXL » avec une coquille).
2. **Jours d'ouverture** : « Lundi au Dimanche » en haut de l'accueil, « Mardi au Dimanche » dans le pied de page (sur la même page), réglage Orderable Mardi→Samedi 10h–22h.
3. **Zones de livraison** : le texte affiché ne correspond pas à WooCommerce, et le découpage par code postal **ne peut pas fonctionner** :
   - **84160** = Cucuron, Vaugines (zone 1 affichée) **mais aussi Cadenet, Lourmarin, Puyvert** (zone 2 affichée) → avec la règle par code postal, ces trois communes tombent en zone 1.
   - **84240** = Ansouis, Cabrières-d'Aigues… **et 7 autres communes** (La Tour-d'Aigues, Grambois, La Motte-d'Aigues, Peypin-d'Aigues, Sannes, La Bastide-des-Jourdans, Vitrolles-en-Luberon) qui sont donc acceptées aujourd'hui sans être annoncées.
   - **Lauris (84360)** est annoncée en zone 2 mais **n'est dans aucune zone** WooCommerce.
   - Minimums : 20/35/40 € affichés, 50 € appliqués partout (règle WooCommerce + snippet WPCode).
   → D'où la vérification **par commune** (code INSEE) prévue dans le nouveau modèle.
4. **Textes en anglais** visibles : « No products in the cart », « Find locations near you… Enter your Postcode / Zip » (popup multi-location), pages de démo en anglais.
5. **Slugs incohérents** avec le produit (problème SEO, et redirections 301 à faire au cas par cas) : `tartare-thon` = Tartare **Daurade**, `tartare-saumon` = Tartare **Crevettes**, `saumon-cheese-2` = Spring Roll **Poulet frit parmesan**, `thon-cuit-cheese-ciboulette` = Spring Roll **Thon épicé**, `eau-petillante-1l` = Eau pétillante **0,75 cl**, `orangina-fuze-tea` = Orangina seul, `saumon-original-18-pieces` = Original box **22 pièces**…
6. **Coquilles** : « 0,75cl / 0,50cl » (pour 75 cl / 50 cl), « Jus Litchie », « ognions fris », « Cabriere d'aigues », « On vous attends », « Plats chaud », « Saumon For  Ever » (double espace).
7. **Photos** : beaucoup de fichiers s'appellent `SAYTO-…` (photos d'une autre enseigne ou d'un fournisseur ?) et `Ontwerp-zonder-titel-…` (modèles Canva). **Question de droits d'utilisation.**
8. Produit de saison encore en vente (Box Saint-Valentin en précommande).
9. Aucune page légale, aucune politique cookies alors que Jetpack Stats est chargé.

---

## 3. Questions à trancher

**Identité et contenu**
1. Nom officiel : Yaoma Sushi ou Kiyo Sushi ? (Raison sociale, SIRET, n° de TVA intracommunautaire, directeur de publication : nécessaires pour les mentions légales.)
2. Jours et horaires réels, midi et soir ? Jours de fermeture ?
3. Un deuxième restaurant est-il prévu (et quand) ? Cela change la priorité de la page « choix du restaurant ».
4. Les photos `SAYTO-…` : avez-vous le droit de les utiliser ? Sinon, prévoir un shooting.
5. Box Saint-Valentin : à archiver (désactivée) ou à supprimer ?

**Livraison**

6. Liste exacte des communes par zone (en particulier : Lauris oui ou non ? Les 7 autres communes du 84240 ?).
7. Règle réelle : minimum midi/soir par zone (20/35/40 €) ou 50 € partout ? Frais de livraison (aujourd'hui « gratuite ») ? Seuil de gratuité ?
8. Comment définir midi et soir : selon le **créneau choisi** (ma proposition) ou selon l'heure de passage de la commande ?

**Paiement et caisse**

9. Moyens acceptés aujourd'hui : en ligne (WooPayments ?), espèces, CB au TPE, titres-restaurant papier ou carte (lesquels : Swile, Edenred, Up… ?) ? Le paiement en ligne passe sur Stripe : avez-vous déjà un compte Stripe ?
10. Le restaurant a-t-il déjà une **caisse enregistreuse certifiée NF525** ? (Voir §6, c'est le point le plus important pour la conformité.)
11. Licence pour l'alcool : vente à emporter **et** en livraison autorisée ? Faut-il couper l'alcool en livraison ?

**Impression**

12. Modèle d'imprimante actuel (marque, USB ou réseau) et comment elle est utilisée avec le plugin zprint ? Une imprimante cuisine et une au comptoir ?

**Technique et accès**

13. Accès : registrar/DNS du domaine, hébergeur actuel, boîte mail du restaurant (pour l'envoi d'e-mails depuis `@yaoma-sushi.com`).
14. Pour les allergènes et l'historique : pouvez-vous créer une **clé API REST WooCommerce (lecture seule)** ? Elle permettra de récupérer les allergènes Orderable s'ils sont saisis, les vrais réglages de zones et de créneaux, et les ~2 200 commandes.
15. Souhaitez-vous reprendre les comptes clients existants (e-mail, adresses) ? Leurs mots de passe ne sont pas récupérables proprement : ils devront faire « mot de passe oublié » au premier accès.
16. Nom pour « Accompagnements » : je propose **« Les petits plus »**.

---

## 4. Stack proposée

| Besoin | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript strict + Tailwind CSS** | Rendu serveur pour le SEO, un seul code pour le site, le back-office et l'API. Votre préférence et un écosystème mûr. |
| Base | **PostgreSQL 16 + Prisma** | Transactions fiables (commandes, paiements), `LISTEN/NOTIFY` pour le temps réel, contraintes en base. |
| Validation | **Zod** (partagé client/serveur) | Une seule définition des règles, réutilisée pour l'OpenAPI (`zod-to-openapi`). |
| Auth | **Better Auth** (adaptateur Prisma) | Sessions en base et cookies httpOnly, 2FA TOTP, limitation de débit et verrouillage intégrés ; utilisé pour le personnel et les comptes clients optionnels. Les rôles et les droits par restaurant restent dans notre code (testés). |
| Temps réel | **SSE** (Server-Sent Events) + Postgres `LISTEN/NOTIFY` | Plus simple que WebSocket, traverse les proxys, se reconnecte tout seul ; suffisant pour l'écran cuisine. |
| Tâches de fond | **pg-boss** (file de tâches dans Postgres) | E-mails, webhooks sortants avec relances, clôtures, sauvegardes, sans Redis. |
| Paiement | **Stripe** (Payment Element : CB, Apple Pay, Google Pay) | Clés chiffrées en base, par restaurant ; webhooks signés. |
| E-mails | **Resend** (ou Brevo, hébergé en France) via React Email | Gabarits propres et typés. |
| Images | **sharp** → WebP (+ AVIF) en 4 tailles, stockage **S3** | Ré-encodage systématique (sécurité) et recadrage carré automatique. |
| Tests | **Vitest** (règles métier) + **Playwright** (parcours de commande) | Les tests demandés : panier, minimums, créneaux, paiements, droits. |
| Dates | `date-fns-tz`, fuseau **Europe/Paris** en dur par restaurant | Changements d'heure (créneaux du dernier dimanche d'octobre…). |

### Hébergement recommandé : VPS en France plutôt que Vercel

Le temps réel (SSE de longue durée), le polling CloudPRNT et Epson SDP (l'imprimante interroge le serveur toutes les 5 à 10 s, toute la journée), les tâches de fond et `LISTEN/NOTIFY` vont mieux avec un serveur Node permanent que dans des fonctions serverless (durée limitée, coût par invocation, pas de connexion persistante).

- **VPS Hetzner (Falkenstein) ou OVH/Scaleway (France)**, environ 10 à 20 €/mois, **Docker Compose** : Next.js (`standalone`), PostgreSQL, Caddy (HTTPS automatique).
- Stockage d'images : **Scaleway Object Storage** ou **OVH Object Storage** (S3, données en France, RGPD), avec CDN.
- Sauvegardes : `pg_dump` chiffré toutes les nuits vers un autre stockage S3, rétention 30 jours, plus une restauration testée.
- Erreurs : Sentry (offre gratuite) ou GlitchTip auto-hébergé. Disponibilité : UptimeRobot.
- Déploiement : GitHub Actions → build de l'image → `docker compose pull && up` (bascule sans coupure).

Alternative possible : Vercel + Neon avec un petit service séparé pour SSE et CloudPRNT. Elle coûte plus cher et sépare le système en deux morceaux ; je ne la recommande pas ici.

---

## 5. Modèle de données (vue d'ensemble)

Principes : **montants en centimes (entiers)**, prix **TTC** stockés avec leur taux de TVA (HT calculé), identifiants `cuid`, horodatages UTC affichés en Europe/Paris. Une commande validée est **figée** : ses lignes copient nom, prix, TVA et options au moment de la commande.

```
Organisation ─┬─ Restaurant ─┬─ HoraireHebdo (jour, ouverture, fermeture, service : MIDI/SOIR)
              │              ├─ FermetureExceptionnelle (du, au, motif)
              │              ├─ ReglagesCommande (services actifs, délai prépa, intervalle créneau,
              │              │                    max commandes/créneau, commandes en pause jusqu'à…)
              │              ├─ ZoneLivraison ─┬─ ZoneCommune (code INSEE, nom, code postal)
              │              │                 └─ min midi / min soir, frais, seuil gratuité, délai, actif
              │              ├─ MoyenPaiement (type, actif en retrait / en livraison / sur place)
              │              ├─ CompteStripe (clés chiffrées, secret webhook)
              │              ├─ Imprimante (méthode : NAVIGATEUR / CLOUDPRNT / EPSON_SDP / PRINTNODE,
              │              │              format 58/80/A4, exemplaires, auto)
              │              ├─ DestinataireAlerte, CleApi, WebhookSortant
              │              └─ RestaurantProduit (surcharge : actif, prix, rupture) ── Produit
              │                 RestaurantVariante (surcharge prix/rupture)          ── Variante
              │
              ├─ Categorie (ordre, visible, type : NORMALE / PETITS_PLUS)
              ├─ Produit (slug, nom, descriptions, prix TTC, taux TVA, image, badges[],
              │           allergenes[14], qte max, services autorisés, alcool, ancienSlugWP, wpId)
              │   ├─ ProduitCategorie (ordre dans la catégorie)
              │   ├─ Variante (attributs ex. {Quantité:6, Style:Frit}, prix, image, wpId)
              │   └─ GroupeOptions ─ Option (prix supplémentaire, min/max choix)
              ├─ Image (clé S3, nom d'origine, tailles WebP, hash)
              ├─ CodePromo (type : MONTANT / POURCENT / LIVRAISON_OFFERTE, validité, minimum, restaurants)
              │
              ├─ Utilisateur (rôle : SUPER_ADMIN / PROPRIETAIRE / GERANT / EMPLOYE, 2FA)
              │   └─ AffectationRestaurant (utilisateur ↔ restaurant)
              ├─ Client (optionnel, e-mail, téléphone) ─ AdresseClient
              │
              ├─ Commande (numéro séquentiel par restaurant et par an, restaurant, client (copie),
              │            mode, créneau, adresse (copie) + zone, totaux HT/TVA/TTC, frais, remise,
              │            statut, statutPaiement, source : WEB / API / IMPORT_WP, token de suivi)
              │   ├─ LigneCommande (copie nom/prix/TVA/variante/options, quantité)
              │   ├─ HistoriqueStatut (de → vers, par qui, quand)       ← ajout seul
              │   ├─ Paiement (moyen, montant, Stripe PaymentIntent, état)  ← ajout seul
              │   ├─ Remboursement / Avoir (montant, lignes, motif, par qui)   ← ajout seul
              │   └─ TravailImpression (imprimante, gabarit, état, tentatives)
              │
              ├─ ClotureJournaliere (restaurant, date, totaux par mode/moyen/TVA,
              │                      hash chaîné avec la clôture précédente)
              └─ JournalAudit (acteur, action, entité, avant/après, IP, date, hash chaîné)
```

Règles d'intégrité clés :

- **Vérification de zone** : l'adresse est saisie avec l'autocomplétion de la Base Adresse Nationale (api-adresse.data.gouv.fr, gratuite), qui fournit le **code INSEE** de la commune. La zone est déterminée par le code INSEE, ce qui règle le cas « 84160 = 5 communes ». En repli, le client choisit sa commune dans la liste filtrée par code postal.
- **Minimum de commande** : calculé côté serveur au moment de la validation, selon la zone et le service (midi/soir) **du créneau choisi**. Le même code alimente l'affichage « il vous manque Y € ».
- **Créneaux** : capacité vérifiée dans une transaction (verrou sur le créneau) pour ne jamais dépasser le maximum par créneau.
- **Immuabilité** : après validation, aucune mise à jour des lignes ni des montants (contrôlé dans le code et par un trigger PostgreSQL). Seuls le statut et les paiements évoluent, par ajout de lignes. Une correction passe par une annulation ou un avoir tracé.

---

## 6. Conformité « logiciel de caisse » (art. 286 I-3° bis CGI) — à lire

- Si le nouveau système **enregistre des encaissements** d'espèces, de CB au TPE ou de titres-restaurant (le livreur ou le comptoir marque « payé en espèces »), il entre dans le périmètre des **logiciels de caisse** : il doit garantir inaltérabilité, sécurisation, conservation et archivage des données.
- Je peux **concevoir** le système pour respecter ces 4 principes (données figées, journal chaîné par hash, clôtures journalières, mensuelles et annuelles, archives signées). En revanche, le code seul **ne vaut pas conformité** : la loi exige une **certification par un organisme accrédité (NF525 / AFNOR-Infocert, ou LNE)**. La loi de finances 2025 a supprimé la possibilité d'une simple attestation individuelle de l'éditeur. Une certification est une démarche payante (audit, plusieurs milliers d'euros, renouvellement annuel) que je ne peux pas faire à votre place. Amende en cas de contrôle : 7 500 € par logiciel non conforme.
- **Ma recommandation** pour démarrer : notre système **prend les commandes** et gère le paiement en ligne Stripe. Pour les paiements sur place (espèces, TPE, titres-restaurant), il indique seulement « **à encaisser** » sur le ticket, et l'encaissement réel est passé sur la **caisse certifiée du restaurant**. Le paiement en ligne par un prestataire bancaire est, selon la doctrine (BOFiP), généralement hors périmètre. **À valider avec votre expert-comptable** (question 10).
- Le modèle de données est prévu pour pouvoir passer plus tard à une version certifiable sans tout refaire.

---

## 7. Plan de l'import (phase 1, pour information)

- Script Node/TypeScript `import/run.ts`, **idempotent** : chaque objet est identifié par son `wpId` WooCommerce ; relancer le script met à jour au lieu de dupliquer.
- Étapes : catégories → produits par catégorie (pagination) → variations (une requête par variation) → ordre depuis `/commander-2/` → images (original, repli sur la miniature, WebP 160/320/640/1200 px, hash pour éviter de retraiter) → textes de l'accueil → **`import/data.json` relisible** → insertion en base (étape séparée, lancée seulement après votre relecture).
- Les données absentes de l'API publique (allergènes, vrais créneaux et zones, commandes) passent par l'**API REST authentifiée** (clé en lecture seule), pas par du scraping.

---

**STOP.** J'attends vos réponses aux questions du §3 et votre validation de la stack (§4), de l'hébergement et du modèle de données (§5) avant de démarrer la phase 1 (import).
