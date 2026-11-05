-- CreateTable
CREATE TABLE "SeoDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SeoDraft_shop_createdAt_idx" ON "SeoDraft"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeoDraft_shop_activeProductId_key" ON "SeoDraft"("shop", "activeProductId");
