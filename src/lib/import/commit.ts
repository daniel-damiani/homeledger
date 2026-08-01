import { prisma } from "../db";
import { matchCategoryId } from "../categorize";
import { detachLoanMirrorsForTransactions, maybeAutoLinkLoan } from "../loan-link";
import type { ParsedRow } from "./parsers";

export async function commitImport(opts: {
  accountId: string;
  filename: string;
  format: string;
  rows: ParsedRow[];
}) {
  const batch = await prisma.importBatch.create({
    data: {
      accountId: opts.accountId,
      filename: opts.filename,
      format: opts.format,
      rowCount: opts.rows.length,
    },
  });

  let imported = 0;
  let skipped = 0;
  let linked = 0;
  let balanceDelta = 0;

  for (const row of opts.rows) {
    const categoryId = await matchCategoryId(row.payee, row.memo);
    try {
      const created = await prisma.transaction.create({
        data: {
          accountId: opts.accountId,
          date: row.date,
          payee: row.payee,
          memo: row.memo,
          amountCents: row.amountCents,
          categoryId,
          externalId: row.externalId,
          importBatchId: batch.id,
        },
      });
      imported += 1;
      balanceDelta += row.amountCents;
      const link = await maybeAutoLinkLoan(created.id);
      if (link) linked += 1;
    } catch {
      skipped += 1;
    }
  }

  await prisma.account.update({
    where: { id: opts.accountId },
    data: { balanceCents: { increment: balanceDelta } },
  });

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { importedCount: imported, skippedCount: skipped },
  });
  return { ...updated, linkedCount: linked };
}

export async function undoImportBatch(batchId: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { transactions: true },
  });
  if (!batch || batch.undone) return null;

  const txnIds = batch.transactions.map((t) => t.id);
  await detachLoanMirrorsForTransactions(txnIds);

  const remaining = await prisma.transaction.findMany({
    where: { importBatchId: batchId },
  });
  const delta = remaining.reduce((s, t) => s + t.amountCents, 0);

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { importBatchId: batchId } }),
    prisma.account.update({
      where: { id: batch.accountId },
      data: { balanceCents: { decrement: delta } },
    }),
    prisma.importBatch.update({
      where: { id: batchId },
      data: { undone: true },
    }),
  ]);

  return batch;
}
