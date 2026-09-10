import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds } from "@/lib/money";

/** Sweep half of this month's surplus into the selected goal (deterministic). */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const goalId = String(body.goalId || "");
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.status !== "ACTIVE") {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const month = formatMonthKey();
  const { start, end } = monthBounds(month);
  const income = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { gt: 0 } },
    _sum: { amountCents: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { lt: 0 } },
    _sum: { amountCents: true },
  });
  const surplus = (income._sum.amountCents ?? 0) + (expense._sum.amountCents ?? 0);
  if (surplus <= 0) {
    return NextResponse.json({ error: "No surplus this month to sweep" }, { status: 400 });
  }

  const remaining = Math.max(0, goal.targetCents - goal.currentCents);
  const sweptCents = Math.min(remaining, Math.floor(surplus / 2));
  if (sweptCents <= 0) {
    return NextResponse.json({ error: "Goal already funded" }, { status: 400 });
  }

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: {
      currentCents: { increment: sweptCents },
      status:
        goal.currentCents + sweptCents >= goal.targetCents ? "COMPLETED" : "ACTIVE",
    },
  });

  return NextResponse.json({ sweptCents, goal: updated });
}