-- Add available balance field synced from SimpleFIN
ALTER TABLE "Account" ADD COLUMN "availableBalanceCents" INTEGER;
