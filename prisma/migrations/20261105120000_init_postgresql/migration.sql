-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConnection" (
    "shop" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConnection_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ImageSettings" (
    "shop" TEXT NOT NULL,
    "altTemplate" TEXT NOT NULL DEFAULT '[Category] [Product Title] [Color]',
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 95,
    "autoProcess" BOOLEAN NOT NULL DEFAULT false,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "autoAssign" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImageSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ImageReview" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "originalAlt" TEXT NOT NULL,
    "generatedAlt" TEXT NOT NULL,
    "detectedColor" TEXT NOT NULL,
    "matchedColor" TEXT,
    "confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sourceFingerprint" TEXT,
    "variantStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productId" TEXT,
    "dedupeKey" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageChange" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "previousAlt" TEXT NOT NULL,
    "appliedAlt" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteScan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "report" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageOptimization" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "activeMediaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "quality" INTEGER NOT NULL,
    "maxWidth" INTEGER NOT NULL,
    "originalBytes" INTEGER,
    "optimizedBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "originalData" BYTEA,
    "optimizedData" BYTEA,
    "originalHash" TEXT,
    "appliedHash" TEXT,
    "sourceUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageOptimization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationReport" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "report" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoDraft" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "activeProductId" TEXT,
    "productTitle" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "accountId" TEXT,
    "accountName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "transactionId" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "subtotalPrice" DOUBLE PRECISION,
    "totalTax" DOUBLE PRECISION,
    "totalShipping" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "raw" TEXT,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "eventName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "transactionId" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "parameters" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingHealth" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issues" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageReview_shop_status_createdAt_idx" ON "ImageReview"("shop", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImageReview_shop_mediaId_key" ON "ImageReview"("shop", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkJob_dedupeKey_key" ON "WorkJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "WorkJob_status_runAt_idx" ON "WorkJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "WorkJob_shop_createdAt_idx" ON "WorkJob"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ImageChange_shop_createdAt_idx" ON "ImageChange"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "SiteScan_shop_createdAt_idx" ON "SiteScan"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ImageOptimization_shop_createdAt_idx" ON "ImageOptimization"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImageOptimization_shop_activeMediaId_key" ON "ImageOptimization"("shop", "activeMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationReport_shop_kind_key" ON "IntegrationReport"("shop", "kind");

-- CreateIndex
CREATE INDEX "SeoDraft_shop_createdAt_idx" ON "SeoDraft"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeoDraft_shop_activeProductId_key" ON "SeoDraft"("shop", "activeProductId");

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

