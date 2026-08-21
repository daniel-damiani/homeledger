import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMonthKey, shiftMonthKey } from "@/lib/money";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const month = String(body.month || formatMonthKey());
  const prev = shiftMonthKey(month, -1);
  const prevBudgets = await prisma.budget.findMany({ where: { month: prev } });
  let copied = 0;
  for (const b of prevBudgets) {
    await prisma.budget.upsert({
      where: { categoryId_month: { categoryId: b.categoryId, month } },
      create: { categoryId: b.categoryId, month, limitCents: b.limitCents },
      update: { limitCents: b.limitCents },
    });
    copied += 1;
  }
  return NextResponse.json({ copied, from: prev, to: month });
}