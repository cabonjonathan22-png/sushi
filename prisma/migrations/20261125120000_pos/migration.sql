-- Caisse : ventes au comptoir, ticket client, tiroir-caisse, chaînage des tickets.
ALTER TYPE "OrderSource" ADD VALUE 'POS';
ALTER TABLE "Order" ADD COLUMN "tableLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN "changeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "chainPrev" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN "chainHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintJob" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ORDER';
