-- Manual rollback for 20261107090000_order_import. Not run by Prisma.
-- Removes only the import log; imported orders stay in "ShopifyOrder".
DROP INDEX IF EXISTS "OrderImport_shop_startedAt_idx";
DROP TABLE IF EXISTS "OrderImport";
