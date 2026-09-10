-- Add cleared flag for reconciliation
ALTER TABLE "Transaction" ADD COLUMN "cleared" BOOLEAN NOT NULL DEFAULT false;
