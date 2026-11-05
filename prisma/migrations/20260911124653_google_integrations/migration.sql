-- CreateTable
CREATE TABLE "IntegrationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "report" TEXT,
    "error" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationReport_shop_kind_key" ON "IntegrationReport"("shop", "kind");
