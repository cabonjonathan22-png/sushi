-- Paiement en plusieurs moyens au retrait / à la livraison (ex. titres-restaurant + espèces).
ALTER TABLE "Order" ADD COLUMN "plannedPayments" "PaymentMethod"[];
