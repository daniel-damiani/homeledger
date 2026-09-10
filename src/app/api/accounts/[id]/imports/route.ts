import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { detachLoanMirrorsForTransactions } from "@/lib/loan-link";

/** DELETE /api/accounts/:id/imports — wipe all transactions and restore opening balance. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const txns = await prisma.transaction.findMany({
    where: { accountId: id },
    select: { id: true, amountCents: true },
  });

  const txnIds = txns.map((t) => t.id);
  const totalDelta = txns.reduce((s, t) => s + t.amountCents, 0);

  // Remove loan mirrors linked to these transactions first
  if (txnIds.length > 0) await detachLoanMirrorsForTransactions(txnIds);

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { accountId: id } }),
    prisma.account.update({
      where: { id },
      data: { balanceCents: { decrement: totalDelta } },
    }),
    prisma.importBatch.updateMany({
      where: { accountId: id, undone: false },
      data: { undone: true },
    }),
  ]);

  return NextResponse.json({ ok: true, deletedCount: txnIds.length });
}
