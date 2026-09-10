-- CreateEnum
CREATE TYPE "TaxBucket" AS ENUM ('TRADITIONAL', 'ROTH', 'TAXABLE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "taxBucket" "TaxBucket" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "RetirementProfile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "birthYear" INTEGER,
    "retireAge" INTEGER NOT NULL DEFAULT 65,
    "longevityAge" INTEGER NOT NULL DEFAULT 95,
    "ssFraMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "ssClaimAge" INTEGER NOT NULL DEFAULT 67,
    "desiredAnnualSpendCents" INTEGER,
    "stockPct" INTEGER NOT NULL DEFAULT 70,
    "glidePath" BOOLEAN NOT NULL DEFAULT false,
    "includeSavings" BOOLEAN NOT NULL DEFAULT false,
    "extraMonthlySaveCents" INTEGER NOT NULL DEFAULT 0,
    "stockReturnPct" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "bondReturnPct" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "inflationPct" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "traditionalTaxHaircutPct" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetirementProfile_pkey" PRIMARY KEY ("id")
);
