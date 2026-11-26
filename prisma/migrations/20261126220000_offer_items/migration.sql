-- Offres : plusieurs produits (chacun son prix d'offre) et restriction possible à des zones de livraison.
ALTER TABLE "Offer" ADD COLUMN "items" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Offer" ADD COLUMN "zoneIds" TEXT[];
UPDATE "Offer" SET "items" = jsonb_build_array(jsonb_build_object('productId', "productId", 'variantId', "variantId", 'priceCents', "priceCents"))
  WHERE "productId" IS NOT NULL AND "priceCents" IS NOT NULL;
ALTER TABLE "Offer" DROP COLUMN "productId";
ALTER TABLE "Offer" DROP COLUMN "variantId";
ALTER TABLE "Offer" DROP COLUMN "priceCents";
