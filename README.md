# Yaoma Sushi — site de commande et back-office

Site de commande en ligne (retrait, livraison, sur place) et back-office sur mesure, multi-restaurant. Il remplace le WordPress / WooCommerce / Orderable de yaoma-sushi.com.

**Stack** : Next.js 16 (App Router, rendu serveur) · TypeScript strict · Tailwind CSS 4 · PostgreSQL 18 + Prisma 7 · Stripe · e-mails Resend ou SMTP · stockage S3 compatible · Docker + Caddy.

## Documentation

| Pour qui | Document |
|---|---|
| Patron et équipe | [docs/guide-patron.md](docs/guide-patron.md) |
| Mise en route des imprimantes (BizPrint, Star, Epson, navigateur…) | [docs/impression.md](docs/impression.md) |
| Mise en ligne, bascule depuis WordPress, sauvegardes | [docs/deploiement.md](docs/deploiement.md) |
| Mise en ligne sur Vercel (base Neon, images R2) | [docs/deploiement-vercel.md](docs/deploiement-vercel.md) |
| Caisse / TVA, RGPD, alcool, allergènes | [docs/conformite.md](docs/conformite.md) |
| Intégrations (caisse, livraison…) | `/api/v1/docs` (OpenAPI 3.1 : `/api/v1/openapi.json`) |
| Historique du projet | [docs/phase-0-analyse.md](docs/phase-0-analyse.md), [docs/phase-1-import.md](docs/phase-1-import.md) |

## Démarrage rapide (développement)

```bash
npm install
npm run db:local                      # PostgreSQL local sur le port 5433
cp .env.example .env                  # puis compléter APP_ENCRYPTION_KEY (openssl rand -base64 32)
npx prisma migrate deploy
npm run import:db                     # menu, images, restaurant depuis import/data.json
npm run db:seed -- --email vous@exemple.fr
npm run dev                           # http://localhost:3000 — back-office : /admin
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Tests unitaires : panier, minimums par zone et service, créneaux (heure d'été), statuts, droits, compta, signatures d'impression |
| `npm run test:smoke` | Test de bout en bout contre le serveur lancé : commande, 4 méthodes d'impression, API, webhooks, Stripe, e-mails |
| `npm run typecheck` | Vérification TypeScript |
| `npm run import:fetch [-- --commandes]` | Lit le site WordPress → `import/data.json` (+ historique dans `import/private/`) |
| `npm run import:db [-- --update]` | `data.json` → base (relançable, sans doublon) |
| `npm run import:orders` | Historique WooCommerce → base (relançable) |
| `npm run db:seed -- --email … --role OWNER` | Crée un compte du back-office |

## Organisation du code

```
src/lib/            logique métier (testée) : cart, zones, slots, order-status, permissions, accounting,
                    orders/ (création, statuts, paiements, avoirs), print/ (ticket, ESC/POS, Star, Epson, PDF, BizPrint)
src/app/(site)/     site public : accueil, menu, validation, suivi, compte, livraison, pages légales
src/app/admin/      back-office : (panel) écrans avec menu ; (print) cuisine, tickets, exports
src/app/api/        checkout, créneaux, Stripe, flux temps réel (SSE), impression, API publique v1
prisma/             schéma, migrations (dont les verrous d'inaltérabilité), création de comptes
import/             import WordPress (catalogue, images, historique)
deploy/             Docker Compose, Caddy, sauvegardes
agent/              agent d'impression local (ESC/POS réseau)
```
