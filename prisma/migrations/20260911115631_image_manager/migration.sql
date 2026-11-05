-- CreateTable
CREATE TABLE "ImageSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "altTemplate" TEXT NOT NULL DEFAULT '[Category] [Product Title] [Color]',
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 95
);

-- CreateTable
CREATE TABLE "ImageReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ImageReview_shop_status_createdAt_idx" ON "ImageReview"("shop", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ImageReview_shop_mediaId_idx" ON "ImageReview"("shop", "mediaId");
