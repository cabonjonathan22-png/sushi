# Guide de formation (PDF)

Régénère `docs/Guide-formation-Yaoma-Sushi.pdf` à partir de vraies captures d'écran annotées.

1. Travailler sur une **copie** de la base : les captures passent de vraies commandes.

   ```bash
   createdb -h localhost -p 5433 -U yaoma yaoma_formation
   pg_dump -h localhost -p 5433 -U yaoma --no-owner yaoma | psql -q -h localhost -p 5433 -U yaoma yaoma_formation
   npm run build
   DATABASE_URL=postgresql://yaoma@localhost:5433/yaoma_formation APP_URL=http://localhost:3100 DISABLE_WORKER=1 npx next start -p 3100
   ```

2. Capturer les écrans. Il faut un compte propriétaire et le compte client de démonstration :

   ```bash
   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_TOTP=<secret 2FA en base32> DEMO_PASSWORD=… node scripts/formation/capture.mjs
   ```

3. Assembler le PDF. Le texte du guide se trouve dans `content.mjs` :

   ```bash
   node scripts/formation/build.mjs docs/Guide-formation-Yaoma-Sushi.pdf
   ```

Ensuite, supprimer la base de formation : `dropdb -h localhost -p 5433 -U yaoma yaoma_formation`.
