-- Manual rollback for 20261106160000_attribution_channels. Not run by Prisma.
-- Take a database backup first. This removes only what the migration added.
DROP INDEX IF EXISTS "ChannelRule_shop_position_idx";
DROP INDEX IF EXISTS "ShopifyOrder_shop_attributionStatus_idx";
DROP TABLE IF EXISTS "ChannelRule";
DROP TABLE IF EXISTS "AttributionSettings";
ALTER TABLE "ShopifyOrder" DROP COLUMN IF EXISTS "attributionConfidence",
DROP COLUMN IF EXISTS "attributionEvidence",
DROP COLUMN IF EXISTS "attributionStatus",
DROP COLUMN IF EXISTS "epik",
DROP COLUMN IF EXISTS "lastChannel",
DROP COLUMN IF EXISTS "lastNonDirectChannel",
DROP COLUMN IF EXISTS "liFatId",
DROP COLUMN IF EXISTS "scCid",
DROP COLUMN IF EXISTS "ttclid",
DROP COLUMN IF EXISTS "utmId";
