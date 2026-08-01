-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "loanMirrorId" TEXT;

-- CreateTable
CREATE TABLE "LoanLinkRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "loanAccountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanLinkRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_loanMirrorId_key" ON "Transaction"("loanMirrorId");

-- CreateIndex
CREATE INDEX "LoanLinkRule_pattern_idx" ON "LoanLinkRule"("pattern");

-- AddForeignKey
ALTER TABLE "LoanLinkRule" ADD CONSTRAINT "LoanLinkRule_loanAccountId_fkey" FOREIGN KEY ("loanAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanLinkRule" ADD CONSTRAINT "LoanLinkRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
