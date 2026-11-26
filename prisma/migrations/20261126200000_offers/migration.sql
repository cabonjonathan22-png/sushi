-- Offres du moment (prix spécial selon jours / période / horaires).
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "badge" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "variantId" TEXT,
    "priceCents" INTEGER,
    "imageId" TEXT,
    "weekdays" INTEGER[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timeFrom" TEXT NOT NULL DEFAULT '',
    "timeTo" TEXT NOT NULL DEFAULT '',
    "restaurantIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
