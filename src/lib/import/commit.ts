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
    // Secondary dedup: catch cross-format duplicates (e.g. OFX re-import after CSV).
    // OFX often truncates payee names vs CSV (e.g. "COSTCO WHSE ST GEORGE" vs
    // "COSTCO WHSE ST GEORGE UT"), so we fetch same-day same-amount candidates and
    // use a prefix match: if one payee is a prefix of the other (≥10 chars), treat as dupe.
    // SKIP this check when the row has a real bank FITID — the bank guarantees FITID
    // uniqueness, so two different transactions can legitimately share date/amount/payee.
    if (!row.realId) {
      const dayStart = new Date(
        Date.UTC(row.date.getUTCFullYear(), row.date.getUTCMonth(), row.date.getUTCDate())
      );
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const candidates = await prisma.transaction.findMany({
        where: { accountId: opts.accountId, amountCents: row.amountCents, date: { gte: dayStart, lt: dayEnd } },
        select: { payee: true },
      });
      const isDupe = candidates.some((c) => {
        if (c.payee === row.payee) return true;
        const shorter = c.payee.length <= row.payee.length ? c.payee : row.payee;
        const longer  = c.payee.length <= row.payee.length ? row.payee : c.payee;
        return shorter.length >= 10 && longer.startsWith(shorter);
      });
      if (isDupe) {
        skipped += 1;
        continue;
      }
    }

    const categoryId = await matchCategoryId(row.payee, row.memo, row.amountCents);
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
          pending: row.pending ?? false,
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
