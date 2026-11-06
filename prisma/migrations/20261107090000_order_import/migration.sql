-- CreateTable
CREATE TABLE "OrderImport" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "bulkOperationId" TEXT,
    "hosts" TEXT,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderImport_shop_startedAt_idx" ON "OrderImport"("shop", "startedAt");
