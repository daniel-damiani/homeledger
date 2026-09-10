import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/accounts/[id]/reconcile
 * Returns cleared balance, uncleared balance, and recent uncleared transactions.
 */
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [clearedAgg, unclearedAgg, transactions] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId: id, cleared: true },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId: id, cleared: false },
      _sum: { amountCents: true },
    }),
    prisma.transaction.findMany({
      where: { accountId: id, cleared: false },
      orderBy: { date: "desc" },
      take: 200,
      select: { id: true, date: true, payee: true, amountCents: true, cleared: true },
    }),
  ]);

  return NextResponse.json({
    clearedBalanceCents: clearedAgg._sum.amountCents ?? 0,
    unclearedBalanceCents: unclearedAgg._sum.amountCents ?? 0,
    transactions,
  });
}

/**
 * PATCH /api/accounts/[id]/reconcile
 * Body: { txnId: string, cleared: boolean }  — toggle one transaction's cleared flag.
 * Or:   { clearAll: true }                   — mark all current uncleared as cleared.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as { txnId?: string; cleared?: boolean; clearAll?: boolean };

  if (body.clearAll) {
    await prisma.transaction.updateMany({
      where: { accountId: id, cleared: false },
      data: { cleared: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (!body.txnId) return NextResponse.json({ error: "txnId required" }, { status: 400 });

  const txn = await prisma.transaction.update({
    where: { id: body.txnId },
    data: { cleared: body.cleared ?? true },
    select: { id: true, cleared: true },
  });
  return NextResponse.json(txn);
}
