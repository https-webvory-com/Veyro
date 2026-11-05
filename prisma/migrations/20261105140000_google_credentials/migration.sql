-- CreateTable
CREATE TABLE "GoogleCredential" (
    "shop" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCredential_pkey" PRIMARY KEY ("shop")
);

