-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('AMOUNT', 'PERCENT', 'FREE_PRODUCT');

-- CreateEnum
CREATE TYPE "LoyaltyTxKind" AS ENUM ('EARN', 'REDEEM', 'REFUND_REDEEM', 'REVERSE_EARN', 'BONUS', 'ADJUST', 'EXPIRE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "loyaltyDiscountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsSpent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyRewardId" TEXT,
ADD COLUMN     "loyaltyRewardName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "LoyaltyRewardType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "LoyaltyTxKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "orderId" TEXT,
    "rewardId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_customerId_createdAt_idx" ON "LoyaltyTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_orderId_idx" ON "LoyaltyTransaction"("orderId");

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "LoyaltyReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

