import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/net-worth
 * Returns monthly net-worth snapshots for the last 13 months.
 * Method: for each month boundary, compute net worth as
 *   current balance − net transactions after that date
 * This avoids storing historical snapshots in the DB.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: { archived: false },
    select: { id: true, type: true, balanceCents: true },
  });

  // Build 13 month boundaries (today back to 12 months ago, inclusive)
  const now = new Date();
  const months: Date[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d);
  }
  // Also add "now" as the final point
  months.push(new Date());

  // For each account, sum transactions AFTER each boundary to get "what would
  // balance have been at that point" = currentBalance − sum(txns after boundary)
  const series: { month: string; netWorthCents: number }[] = [];

  for (const boundary of months) {
    let nw = 0;
    for (const acc of accounts) {
      // Sum of all transactions after this boundary date
      const agg = await prisma.transaction.aggregate({
        where: { accountId: acc.id, date: { gt: boundary } },
        _sum: { amountCents: true },
      });
      const txnsAfter = agg._sum.amountCents ?? 0;
      const balanceAtPoint = acc.balanceCents - txnsAfter;

      if (acc.type === AccountType.CREDIT || acc.type === AccountType.LOAN) {
        nw -= Math.abs(balanceAtPoint);
      } else {
        nw += balanceAtPoint;
      }
    }
    const label =
      boundary >= now
        ? "Now"
        : boundary.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    series.push({ month: label, netWorthCents: nw });
  }

  // Deduplicate labels (boundary = now produces duplicate "Now")
  const deduped = series.filter((s, i, arr) => arr.findIndex((x) => x.month === s.month) === i);

  return NextResponse.json(deduped);
}
