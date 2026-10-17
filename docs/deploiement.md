# Déploiement et bascule depuis WordPress

## Hébergement recommandé

Un VPS en France ou en UE (Hetzner CX22, OVH VPS-1 ou Scaleway DEV1-S : 2 vCPU, 4 Go, environ 5 à 15 €/mois), sous Debian 12 ou Ubuntu 24.04, avec Docker. Tout tourne dans `deploy/docker-compose.yml` :

| Service | Rôle |
|---|---|
| `db` | PostgreSQL 18 (volume `pgdata`) |
| `migrate` | Applique les migrations à chaque déploiement, puis s'arrête |
| `app` | Le site et le back-office, avec le worker (e-mails, webhooks, impression, ménage) |
| `caddy` | HTTPS automatique (Let's Encrypt) et redirection www |
| `backup` | `pg_dump` chaque nuit, 30 jours conservés (volume `backups`) |

## Première installation

```bash
# Sur le serveur
apt update && apt install -y docker.io docker-compose-plugin git
git clone <dépôt> /opt/yaoma && cd /opt/yaoma
cp deploy/.env.production.example deploy/.env && nano deploy/.env   # compléter
openssl rand -base64 32    # → APP_ENCRYPTION_KEY (à conserver aussi hors du serveur !)
docker compose -f deploy/docker-compose.yml up -d --build
```

> ⚠ **APP_ENCRYPTION_KEY** chiffre les clés Stripe, BizPrint et 2FA stockées en base. Sans elle, une sauvegarde restaurée ne permet plus de payer ni d'imprimer. Conservez-la dans un gestionnaire de mots de passe.

Comptes et données :

```bash
C="docker compose -f deploy/docker-compose.yml run --rm migrate"
# Catalogue, images (téléchargées depuis le site actuel puis converties en WebP) et restaurant :
$C sh -c "npx tsx import/run.ts && npx tsx import/to-db.ts"
$C npx tsx prisma/seed.ts --email vous@exemple.fr --role SUPER_ADMIN
$C npx tsx prisma/seed.ts --email patron@exemple.fr --name "Patron" --role OWNER
```

Les images importées sont copiées dans le stockage (volume `storage`, ou S3 si `S3_BUCKET` est défini). `import/run.ts` relit le site actuel : à lancer **avant** la bascule DNS. Pour repartir exactement du `data.json` relu, sans relire le site, utilisez `npx tsx import/run.ts` sur votre poste, puis copiez `import/images/` sur le serveur.

## Bascule depuis WordPress (sans perte de commande)

**J−7 → J−1** (le nouveau site tourne sur une adresse provisoire, ex. `nouveau.yaoma-sushi.com`) :

1. Contrôler le menu, les prix, les photos, les horaires, les zones, les minimums et les moyens de paiement dans le back-office.
2. Stripe : créer le webhook vers `https://yaoma-sushi.com/api/stripe/webhook/<id restaurant>` (l'adresse exacte est affichée dans Mon restaurant → Paiements) et saisir les clés **live**.
3. Imprimantes : configurer BizPrint (`docs/impression.md`) et faire une commande test.
4. E-mails : `RESEND_API_KEY` ou `SMTP_URL`, enregistrements SPF/DKIM du domaine. Vérifier la réception.
5. Compléter les mentions légales (Réglages du site) et créer les comptes du personnel.

**Jour J** (créneau calme, ex. lundi, jour de fermeture) :

1. WordPress : mettre la boutique en pause (désactiver la commande en ligne) et **désactiver l'impression BizPrint côté WordPress**.
2. Rapatrier l'historique :
   ```bash
   $C npx tsx import/run.ts --sans-images --commandes   # avec WC_CONSUMER_KEY/SECRET dans deploy/.env
   $C npx tsx import/orders-to-db.ts                    # commandes WooCommerce → historique (WP-xxxx)
   ```
3. Baisser le TTL DNS la veille (300 s), puis faire pointer `yaoma-sushi.com` et `www` (A/AAAA) vers le VPS. Caddy obtient le certificat tout seul.
4. Tester : accueil, commande test (retrait + livraison), ticket, e-mail, paiement en ligne réel de 1 € remboursé ensuite, puis anciennes URL (`/commander-2/`, `/produit/...`) qui doivent rediriger en 301.
5. Google Search Console : soumettre `https://yaoma-sushi.com/sitemap.xml`.
6. Révoquer la clé API WooCommerce. Garder le WordPress hors ligne (sauvegarde) 3 mois.

**Retour arrière** : remettre l'ancien DNS. Le WordPress n'a pas été modifié.

## Mises à jour

```bash
cd /opt/yaoma && git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

Les migrations s'appliquent avant le redémarrage de l'application.

## Sauvegardes

- Locales : volume `backups`, une sauvegarde par nuit, 30 jours.
- **Copie hors du serveur (indispensable)** : par exemple avec rclone vers un stockage S3 (Scaleway, OVH), via une tâche cron sur l'hôte :
  `0 4 * * * docker run --rm -v yaoma_backups:/b -v /root/.config/rclone:/config/rclone rclone/rclone copy /b s3:yaoma-backups`
- **Restaurer** (à tester une fois par trimestre) :
  `docker compose -f deploy/docker-compose.yml exec -T db pg_restore -U yaoma -d yaoma --clean < yaoma-AAAA-MM-JJ.dump`

## Surveillance

- `https://yaoma-sushi.com/api/health` dans UptimeRobot (gratuit) : alerte si le site ou la base ne répond plus.
- Journaux : `docker compose -f deploy/docker-compose.yml logs -f app`.
- Erreurs d'envoi (e-mails, webhooks, impression) : relancées automatiquement ; `failingJobs` dans `/api/health`.

## Développement local

```bash
npm install
npm run db:local          # PostgreSQL local (port 5433, données hors du projet)
cp .env.example .env      # compléter APP_ENCRYPTION_KEY
npx prisma migrate deploy && npm run import:db
npm run db:seed -- --email vous@exemple.fr
npm run dev               # http://localhost:3000 et /admin
npm test                  # tests unitaires (panier, minimums, créneaux, droits, compta, impression)
npm run test:smoke        # test de bout en bout contre le serveur lancé (base de développement)
```
