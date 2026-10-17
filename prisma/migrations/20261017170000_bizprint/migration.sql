-- Impression BizPrint (BizSwoop), utilisée par le restaurant avant la refonte.
ALTER TYPE "PrinterMethod" ADD VALUE 'BIZPRINT';

-- Renommage (et non suppression) : conserve les n° d'imprimante PrintNode déjà saisis.
ALTER TABLE "Printer" RENAME COLUMN "printNodeId" TO "remotePrinterId";

ALTER TABLE "PrintJob" ADD COLUMN "remoteJobId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Restaurant" ADD COLUMN "bizprintPublicKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "bizprintSecretEnc" TEXT NOT NULL DEFAULT '';
