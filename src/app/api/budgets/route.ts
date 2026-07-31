import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const month = String(body.month || "");
  const categoryId = String(body.categoryId || "");
  const limitCents = dollarsToCents(Number(body.limit || 0));
  if (!month || !categoryId) {
    return NextResponse.json({ error: "month and categoryId required" }, { status: 400 });
  }
  const budget = await prisma.budget.upsert({
    where: { categoryId_month: { categoryId, month } },
    create: { categoryId, month, limitCents },
    update: { limitCents },
  });
  return NextResponse.json(budget);
}