-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "schemaGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sitemapIncluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "accountId" TEXT,
    "accountName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "scopes" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "transactionId" TEXT,
    "totalPrice" REAL NOT NULL,
    "subtotalPrice" REAL,
    "totalTax" REAL,
    "totalShipping" REAL,
    "currency" TEXT NOT NULL,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "raw" TEXT
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "eventName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "transactionId" TEXT,
    "value" REAL,
    "currency" TEXT,
    "parameters" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrackingHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT,
    "lastChecked" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issues" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Video_shop_createdAt_idx" ON "Video"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_shop_videoId_key" ON "Video"("shop", "videoId");

-- CreateIndex
CREATE INDEX "Integration_shop_idx" ON "Integration"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_shop_platform_key" ON "Integration"("shop", "platform");

-- CreateIndex
CREATE INDEX "ShopifyOrder_shop_createdAt_idx" ON "ShopifyOrder"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_shop_orderId_key" ON "ShopifyOrder"("shop", "orderId");

-- CreateIndex
CREATE INDEX "TrackingEvent_shop_orderId_idx" ON "TrackingEvent"("shop", "orderId");

-- CreateIndex
CREATE INDEX "TrackingEvent_shop_eventName_timestamp_idx" ON "TrackingEvent"("shop", "eventName", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingHealth_shop_key" ON "TrackingHealth"("shop");

-- CreateIndex
CREATE INDEX "AuditIssue_shop_status_idx" ON "AuditIssue"("shop", "status");
