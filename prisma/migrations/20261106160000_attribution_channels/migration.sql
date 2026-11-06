-- AlterTable
ALTER TABLE "ShopifyOrder" ADD COLUMN     "attributionConfidence" TEXT,
ADD COLUMN     "attributionEvidence" TEXT,
ADD COLUMN     "attributionStatus" TEXT,
ADD COLUMN     "epik" TEXT,
ADD COLUMN     "lastChannel" TEXT,
ADD COLUMN     "lastNonDirectChannel" TEXT,
ADD COLUMN     "liFatId" TEXT,
ADD COLUMN     "scCid" TEXT,
ADD COLUMN     "ttclid" TEXT,
ADD COLUMN     "utmId" TEXT;

-- CreateTable
CREATE TABLE "AttributionSettings" (
    "shop" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL DEFAULT 'last_non_direct',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributionSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ChannelRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopifyOrder_shop_attributionStatus_idx" ON "ShopifyOrder"("shop", "attributionStatus");

-- CreateIndex
CREATE INDEX "ChannelRule_shop_position_idx" ON "ChannelRule"("shop", "position");
