-- AlterTable
ALTER TABLE "ImageReview" ADD COLUMN "sourceFingerprint" TEXT;
ALTER TABLE "ImageReview" ADD COLUMN "variantStatus" TEXT;

-- CreateTable
CREATE TABLE "WorkJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productId" TEXT,
    "dedupeKey" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "lockedUntil" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ImageChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "previousAlt" TEXT NOT NULL,
    "appliedAlt" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SiteScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "report" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImageOptimization" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "originalData" BLOB,
    "optimizedData" BLOB,
    "originalHash" TEXT,
    "appliedHash" TEXT,
    "sourceUrl" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImageSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "altTemplate" TEXT NOT NULL DEFAULT '[Category] [Product Title] [Color]',
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 95,
    "autoProcess" BOOLEAN NOT NULL DEFAULT false,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "autoAssign" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ImageSettings" ("altTemplate", "confidenceThreshold", "shop") SELECT "altTemplate", "confidenceThreshold", "shop" FROM "ImageSettings";
DROP TABLE "ImageSettings";
ALTER TABLE "new_ImageSettings" RENAME TO "ImageSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
