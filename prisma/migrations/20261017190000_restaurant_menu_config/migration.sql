-- Menu par restaurant (catégories), plats midi / soir, écran Configuration.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "availableDinner" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "availableLunch" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "RestaurantCategory" (
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RestaurantCategory_pkey" PRIMARY KEY ("restaurantId","categoryId")
);

-- AddForeignKey
ALTER TABLE "RestaurantCategory" ADD CONSTRAINT "RestaurantCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCategory" ADD CONSTRAINT "RestaurantCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

