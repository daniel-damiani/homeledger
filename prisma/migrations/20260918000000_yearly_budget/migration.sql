-- CreateTable
CREATE TABLE "YearlyBudget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearlyBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YearlyBudget_year_idx" ON "YearlyBudget"("year");

-- CreateIndex
CREATE UNIQUE INDEX "YearlyBudget_categoryId_year_key" ON "YearlyBudget"("categoryId", "year");

-- AddForeignKey
ALTER TABLE "YearlyBudget" ADD CONSTRAINT "YearlyBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
