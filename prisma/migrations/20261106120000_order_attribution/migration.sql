-- AlterTable
ALTER TABLE "ShopifyOrder" ADD COLUMN     "attribution" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "fbclid" TEXT,
ADD COLUMN     "firstChannel" TEXT,
ADD COLUMN     "gbraid" TEXT,
ADD COLUMN     "gclid" TEXT,
ADD COLUMN     "landingSite" TEXT,
ADD COLUMN     "msclkid" TEXT,
ADD COLUMN     "referringSite" TEXT,
ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT,
ADD COLUMN     "wbraid" TEXT;

-- CreateIndex
CREATE INDEX "ShopifyOrder_shop_channel_idx" ON "ShopifyOrder"("shop", "channel");
