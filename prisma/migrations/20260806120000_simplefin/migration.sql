-- Add SimpleFIN Access URL to AppSettings
ALTER TABLE "AppSettings" ADD COLUMN "simpleFinAccessUrl" TEXT;

-- Add SimpleFIN account linkage fields to Account
ALTER TABLE "Account" ADD COLUMN "simpleFinId" TEXT;
ALTER TABLE "Account" ADD COLUMN "simpleFinLastSyncAt" TIMESTAMP(3);

-- Unique index so each SimpleFIN account maps to at most one HomeLedger account
CREATE UNIQUE INDEX "Account_simpleFinId_key" ON "Account"("simpleFinId");
