import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents, shiftMonthKey } from "@/lib/money";

function monthsThroughYearEnd(startMonth: string): string[] {
  const [y, m] = startMonth.split("-").map(Number);
  if (!y || !m) return [startMonth];
  const out: string[] = [];
  for (let i = 0; m + i <= 12; i++) {
    out.push(shiftMonthKey(startMonth, i));
  }
  return out;
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const month = String(body.month || "");
  const categoryId = String(body.categoryId || "");
  const limitCents = dollarsToCents(Number(body.limit || 0));
  const throughYearEnd = Boolean(body.throughYearEnd);
  if (!month || !categoryId) {
    return NextResponse.json({ error: "month and categoryId required" }, { status: 400 });
  }

  const months = throughYearEnd ? monthsThroughYearEnd(month) : [month];
  const budgets = [];
  for (const mo of months) {
    const budget = await prisma.budget.upsert({
      where: { categoryId_month: { categoryId, month: mo } },
      create: { categoryId, month: mo, limitCents },
      update: { limitCents },
    });
    budgets.push(budget);
  }
  return NextResponse.json({
    count: budgets.length,
    months,
    budget: budgets[0],
  });
}
