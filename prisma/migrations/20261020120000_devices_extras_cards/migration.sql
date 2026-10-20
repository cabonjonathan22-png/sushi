-- AlterEnum
ALTER TYPE "PrinterMethod" ADD VALUE 'DIRECT_TCP';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "cardNumber" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "extrasDeclined" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Printer" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "agentInfo" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "scanRequestedAt" TIMESTAMP(3),
ADD COLUMN     "testRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "device" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PairingCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "printerId" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PairingCode_codeHash_key" ON "PairingCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_cardNumber_key" ON "Customer"("cardNumber");

