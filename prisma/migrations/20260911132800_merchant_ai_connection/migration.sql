-- CreateTable
CREATE TABLE "AiConnection" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "encryptedKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
