-- « Petits plus » offerts : nombre inclus par produit et remise figée sur la commande.
ALTER TABLE "Order" ADD COLUMN "extrasDiscountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "includedExtras" INTEGER NOT NULL DEFAULT 0;

-- La remise « petits plus offerts » fait partie des montants figés de la commande.
CREATE OR REPLACE FUNCTION yaoma_order_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantId" IS DISTINCT FROM OLD."restaurantId"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."dailyNumber" IS DISTINCT FROM OLD."dailyNumber"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."mode" IS DISTINCT FROM OLD."mode"
     OR NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents"
     OR NEW."discountCents" IS DISTINCT FROM OLD."discountCents"
     OR NEW."extrasDiscountCents" IS DISTINCT FROM OLD."extrasDiscountCents"
     OR NEW."deliveryFeeCents" IS DISTINCT FROM OLD."deliveryFeeCents"
     OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents"
     OR NEW."vatBreakdown"::text IS DISTINCT FROM OLD."vatBreakdown"::text
     OR NEW."promoCode" IS DISTINCT FROM OLD."promoCode"
     OR NEW."placedAt" IS DISTINCT FROM OLD."placedAt" THEN
    RAISE EXCEPTION 'Commande % : montants et identité inaltérables', OLD."reference"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
