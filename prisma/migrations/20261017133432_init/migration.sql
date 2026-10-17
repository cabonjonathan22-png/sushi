-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('PICKUP', 'DELIVERY', 'DINE_IN');

-- CreateEnum
CREATE TYPE "DayPeriod" AS ENUM ('LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE_CARD', 'CASH', 'CARD_TERMINAL', 'MEAL_VOUCHER_PAPER', 'MEAL_VOUCHER_CARD');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('STANDARD', 'EXTRAS');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('AMOUNT', 'PERCENT', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "PrinterMethod" AS ENUM ('BROWSER', 'STAR_CLOUDPRNT', 'EPSON_SDP', 'PRINTNODE', 'LOCAL_AGENT');

-- CreateEnum
CREATE TYPE "PaperWidth" AS ENUM ('MM58', 'MM80', 'A4');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SENT', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEB', 'API', 'ADMIN', 'IMPORT_WP');

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "brandName" TEXT NOT NULL DEFAULT 'Yaoma Sushi',
    "companyName" TEXT NOT NULL DEFAULT '',
    "legalForm" TEXT NOT NULL DEFAULT '',
    "shareCapital" TEXT NOT NULL DEFAULT '',
    "siret" TEXT NOT NULL DEFAULT '',
    "vatNumber" TEXT NOT NULL DEFAULT '',
    "rcs" TEXT NOT NULL DEFAULT '',
    "publisherName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "hostName" TEXT NOT NULL DEFAULT '',
    "hostAddress" TEXT NOT NULL DEFAULT '',
    "extrasLabel" TEXT NOT NULL DEFAULT 'Les petits plus',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phones" TEXT[],
    "email" TEXT NOT NULL DEFAULT '',
    "mapsUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "photoIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "dineInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "prepMinutes" INTEGER NOT NULL DEFAULT 20,
    "slotMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxOrdersPerSlot" INTEGER,
    "maxDaysAhead" INTEGER NOT NULL DEFAULT 6,
    "ordersPausedUntil" TIMESTAMP(3),
    "ordersPausedReason" TEXT NOT NULL DEFAULT '',
    "pickupMinimumCents" INTEGER NOT NULL DEFAULT 0,
    "stripePublishableKey" TEXT NOT NULL DEFAULT '',
    "stripeSecretKeyEnc" TEXT NOT NULL DEFAULT '',
    "stripeWebhookSecretEnc" TEXT NOT NULL DEFAULT '',
    "alertEmails" TEXT[],
    "noAlcoholDelivery" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens" TEXT NOT NULL,
    "closes" TEXT NOT NULL,
    "period" "DayPeriod" NOT NULL,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosurePeriod" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ClosurePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minLunchCents" INTEGER NOT NULL DEFAULT 0,
    "minDinnerCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "freeFromCents" INTEGER,
    "etaMinutes" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZoneArea" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "inseeCode" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DeliveryZoneArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPaymentMethod" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "pickup" BOOLEAN NOT NULL DEFAULT true,
    "delivery" BOOLEAN NOT NULL DEFAULT true,
    "dineIn" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RestaurantPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "PrinterMethod" NOT NULL DEFAULT 'BROWSER',
    "paperWidth" "PaperWidth" NOT NULL DEFAULT 'MM80',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "autoPrint" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deviceToken" TEXT NOT NULL,
    "printNodeId" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "lockedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "files" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "kind" "CategoryKind" NOT NULL DEFAULT 'STANDARD',
    "wpId" INTEGER,
    "legacyUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL DEFAULT 1000,
    "imageId" TEXT,
    "badges" TEXT[],
    "allergens" TEXT[],
    "isAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "maxQuantity" INTEGER,
    "availablePickup" BOOLEAN NOT NULL DEFAULT true,
    "availableDelivery" BOOLEAN NOT NULL DEFAULT true,
    "availableDineIn" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "wpId" INTEGER,
    "legacySlug" TEXT NOT NULL DEFAULT '',
    "legacyUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "priceCents" INTEGER NOT NULL,
    "imageId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "wpId" INTEGER,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantProduct" (
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priceCents" INTEGER,
    "outOfStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RestaurantProduct_pkey" PRIMARY KEY ("restaurantId","productId")
);

-- CreateTable
CREATE TABLE "RestaurantVariant" (
    "restaurantId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priceCents" INTEGER,
    "outOfStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RestaurantVariant_pkey" PRIMARY KEY ("restaurantId","variantId")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "restaurantIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT NOT NULL DEFAULT '',
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRestaurant" (
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,

    CONSTRAINT "UserRestaurant_pkey" PRIMARY KEY ("userId","restaurantId")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "wpId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymizedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL,
    "extra" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "pending2fa" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dailyNumber" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "trackingToken" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'WEB',
    "status" "OrderStatus" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "mode" "ServiceMode" NOT NULL,
    "period" "DayPeriod" NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "addressStreet" TEXT NOT NULL DEFAULT '',
    "addressExtra" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "zoneId" TEXT,
    "zoneName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "promoCode" TEXT NOT NULL DEFAULT '',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "vatBreakdown" JSONB NOT NULL,
    "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL DEFAULT '',
    "options" JSONB NOT NULL DEFAULT '[]',
    "categoryName" TEXT NOT NULL DEFAULT '',
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "isAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "from" "OrderStatus",
    "to" "OrderStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "actor" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL,
    "stripePaymentIntentId" TEXT,
    "failureReason" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "creditNumber" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "stripeRefundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "printerId" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClosure" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totals" JSONB NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "seq" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "restaurantId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT NOT NULL DEFAULT '',
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "OpeningHour_restaurantId_weekday_idx" ON "OpeningHour"("restaurantId", "weekday");

-- CreateIndex
CREATE INDEX "ClosurePeriod_restaurantId_startDate_idx" ON "ClosurePeriod"("restaurantId", "startDate");

-- CreateIndex
CREATE INDEX "DeliveryZoneArea_postalCode_idx" ON "DeliveryZoneArea"("postalCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZoneArea_zoneId_postalCode_city_key" ON "DeliveryZoneArea"("zoneId", "postalCode", "city");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantPaymentMethod_restaurantId_method_key" ON "RestaurantPaymentMethod"("restaurantId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_deviceToken_key" ON "Printer"("deviceToken");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "OutboxJob_doneAt_runAt_idx" ON "OutboxJob"("doneAt", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Image_hash_key" ON "Image"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_wpId_key" ON "Category"("wpId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_wpId_key" ON "Product"("wpId");

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_sortOrder_idx" ON "ProductCategory"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_wpId_key" ON "ProductVariant"("wpId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_wpId_key" ON "Customer"("wpId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_customerId_idx" ON "Session"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_idx" ON "Order"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Order_restaurantId_placedAt_idx" ON "Order"("restaurantId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_restaurantId_slotStart_idx" ON "Order"("restaurantId", "slotStart");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_number_key" ON "Order"("restaurantId", "number");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_at_idx" ON "OrderStatusEvent"("orderId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_creditNumber_key" ON "Refund"("creditNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE INDEX "PrintJob_printerId_status_idx" ON "PrintJob"("printerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosure_restaurantId_date_key" ON "DailyClosure"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_at_idx" ON "AuditLog"("restaurantId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosurePeriod" ADD CONSTRAINT "ClosurePeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZoneArea" ADD CONSTRAINT "DeliveryZoneArea_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPaymentMethod" ADD CONSTRAINT "RestaurantPaymentMethod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantProduct" ADD CONSTRAINT "RestaurantProduct_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantProduct" ADD CONSTRAINT "RestaurantProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantVariant" ADD CONSTRAINT "RestaurantVariant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantVariant" ADD CONSTRAINT "RestaurantVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestaurant" ADD CONSTRAINT "UserRestaurant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestaurant" ADD CONSTRAINT "UserRestaurant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClosure" ADD CONSTRAINT "DailyClosure_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Inaltérabilité (art. 286 I-3° bis CGI) : une commande validée, ses lignes,
-- ses paiements, avoirs, clôtures et le journal ne peuvent être ni modifiés
-- ni supprimés. Les corrections passent par annulation / avoir tracés.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION yaoma_forbid() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Donnée inaltérable : % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$ LANGUAGE plpgsql;

-- Lignes de commande, historique des statuts, clôtures, journal : ni UPDATE ni DELETE.
CREATE TRIGGER order_line_immutable BEFORE UPDATE OR DELETE ON "OrderLine"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();
CREATE TRIGGER order_status_event_immutable BEFORE UPDATE OR DELETE ON "OrderStatusEvent"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();
CREATE TRIGGER daily_closure_immutable BEFORE UPDATE OR DELETE ON "DailyClosure"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();

-- Commandes, paiements, avoirs : jamais supprimés.
CREATE TRIGGER order_no_delete BEFORE DELETE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();
CREATE TRIGGER refund_no_delete BEFORE DELETE ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION yaoma_forbid();

-- Commande : identité et montants figés ; seuls statut, paiement et horodatages évoluent.
CREATE OR REPLACE FUNCTION yaoma_order_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantId" IS DISTINCT FROM OLD."restaurantId"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."dailyNumber" IS DISTINCT FROM OLD."dailyNumber"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."mode" IS DISTINCT FROM OLD."mode"
     OR NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents"
     OR NEW."discountCents" IS DISTINCT FROM OLD."discountCents"
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
CREATE TRIGGER order_frozen BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION yaoma_order_frozen();

-- Paiement / avoir : le montant et le moyen ne changent jamais (seul l'état évolue).
CREATE OR REPLACE FUNCTION yaoma_amount_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
     OR NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN
    RAISE EXCEPTION '% : montant inaltérable', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payment_amount_frozen BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION yaoma_amount_frozen();
CREATE TRIGGER refund_amount_frozen BEFORE UPDATE ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION yaoma_amount_frozen();

-- Temps réel : chaque création / changement de commande est notifié (LISTEN orders).
CREATE OR REPLACE FUNCTION yaoma_notify_order() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('orders', json_build_object(
    'restaurantId', NEW."restaurantId", 'orderId', NEW."id",
    'status', NEW."status", 'op', TG_OP)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER order_notify AFTER INSERT OR UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION yaoma_notify_order();
