-- CreateEnum
CREATE TYPE "PurchaseKind" AS ENUM ('HOUSE', 'CAR', 'CASH');

-- CreateTable
CREATE TABLE "PurchasePlan" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kind" "PurchaseKind" NOT NULL DEFAULT 'HOUSE',
    "extraMonthlySaveCents" INTEGER NOT NULL DEFAULT 0,
    "extraIncomeCents" INTEGER NOT NULL DEFAULT 0,
    "otherDebtMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "replaceHousing" BOOLEAN NOT NULL DEFAULT true,
    "emergencyMonths" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "housePriceCents" INTEGER NOT NULL DEFAULT 40000000,
    "downPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "mortgageRatePct" DOUBLE PRECISION NOT NULL DEFAULT 6.5,
    "mortgageTermYears" INTEGER NOT NULL DEFAULT 30,
    "propertyTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "insuranceAnnualCents" INTEGER NOT NULL DEFAULT 150000,
    "hoaMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "pmiAnnualPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "maintenancePct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "closingCostPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "carPriceCents" INTEGER NOT NULL DEFAULT 3000000,
    "carTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "carFeesCents" INTEGER NOT NULL DEFAULT 50000,
    "carDownPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "carRatePct" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "carTermMonths" INTEGER NOT NULL DEFAULT 60,
    "carInsuranceMonthlyCents" INTEGER NOT NULL DEFAULT 15000,
    "cashTargetCents" INTEGER NOT NULL DEFAULT 1000000,
    "cashSavedOverrideCents" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasePlan_pkey" PRIMARY KEY ("id")
);
