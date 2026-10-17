# Mise en ligne sur Vercel

Le site peut tourner sur Vercel (hébergement « serverless ») en plus du serveur classique
décrit dans `deploiement.md`. Il faut trois services externes : une base PostgreSQL,
un stockage d'images S3 et un service d'e-mail.

## 1. Base de données PostgreSQL

Le plus simple : dans le projet Vercel, ouvrir **Storage → Create Database → Neon** (région Francfort),
puis **Connect** au projet. Vercel crée alors tout seul `DATABASE_URL` et `DATABASE_URL_UNPOOLED`.
Il reste à cliquer sur **Redeploy**. Sans base configurée, la compilation réussit quand même, mais le
site affiche une erreur.

Une autre base PostgreSQL 16 ou plus récente fonctionne aussi (Supabase, Scaleway…).

- `DATABASE_URL` : l'adresse **avec pooler** (connexions courtes, adaptée au serverless).
- `DATABASE_URL_DIRECT` (ou `DATABASE_URL_UNPOOLED` avec Neon) : l'adresse **directe**, sans pooler.
  Elle sert au temps réel des commandes (`LISTEN`) et aux migrations.

Les migrations s'appliquent automatiquement à chaque déploiement (`npm run vercel-build`).

Pour reprendre les données de l'ordinateur local (carte, historique, comptes) :

```bash
pg_dump --no-owner --no-acl -h localhost -p 5433 -U postgres yaoma > yaoma.sql
psql "<DATABASE_URL_DIRECT>" < yaoma.sql
```

## 2. Images (stockage S3)

Le disque d'un serveur Vercel n'est pas conservé : les photos vont sur un stockage S3
compatible, par exemple Cloudflare R2, qui est gratuit jusqu'à 10 Go.

| Variable | Exemple (R2) |
|---|---|
| `S3_BUCKET` | `yaoma-media` |
| `S3_ENDPOINT` | `https://<compte>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | clés API R2 |
| `S3_PUBLIC_URL` | `https://media.yaoma-sushi.com` (domaine public du bucket) |
| `S3_NO_ACL` | `1` (R2 ne gère pas les ACL : rendre le bucket public dans R2) |

Ensuite, envoyer les images existantes une seule fois, depuis l'ordinateur : renseigner ces
variables dans `.env`, puis lancer `npm run storage:s3`.

## 3. Variables d'environnement Vercel

Elles se règlent dans Settings → Environment Variables. Reprendre `deploy/.env.production.example`, en particulier :

- `APP_URL=https://www.yaoma-sushi.com`
- `APP_ENCRYPTION_KEY` : prendre la **même** valeur qu'en local si la base est copiée,
  sinon les clés Stripe et BizPrint chiffrées deviennent illisibles.
- `MAIL_FROM` et `RESEND_API_KEY` (ou `SMTP_URL`) ;
- `CRON_SECRET` : chaîne aléatoire, qui protège la tâche planifiée `/api/cron` ;
- `NEXT_PUBLIC_ORDERS_POLL_SECONDS=10`, pour actualiser plus souvent l'écran des commandes si le
  temps réel est coupé ;
- `TOTP_ISSUER="Yaoma Sushi"`.

## 4. Différences avec un serveur classique

| Fonction | Serveur classique | Vercel |
|---|---|---|
| E-mails, webhooks, impressions BizPrint / PrintNode | Worker toutes les 3 s | Traités juste après chaque commande (`after()`), puis par la tâche planifiée |
| Paiements abandonnés, purges RGPD, statut BizPrint | Worker périodique | `/api/cron`, une fois par jour sur l'offre gratuite, plus souvent sur l'offre Pro (`vercel.json`) |
| Écran des commandes en temps réel | Flux permanent | Flux reconnecté toutes les 5 min, plus une actualisation toutes les 10 s |
| Images | Dossier `storage/` | Stockage S3 obligatoire |

L'offre Vercel Hobby (gratuite) est réservée à un usage non commercial. Pour un restaurant,
prendre l'offre **Pro**. Elle permet aussi de lancer la tâche planifiée toutes les 5 minutes :
remplacer `"0 4 * * *"` par `"*/5 * * * *"` dans `vercel.json`.

## 5. Domaine et Stripe

1. Vercel → Domains : ajouter `yaoma-sushi.com` et `www.yaoma-sushi.com`, puis suivre les
   instructions DNS.
2. Stripe → Webhooks : ajouter l'adresse affichée dans Back-office → Mon restaurant → Paiement en ligne
   (`https://www.yaoma-sushi.com/api/stripe/webhook/<id du restaurant>`), puis y saisir le secret du webhook.
3. Vérifier `https://www.yaoma-sushi.com/api/health`.
