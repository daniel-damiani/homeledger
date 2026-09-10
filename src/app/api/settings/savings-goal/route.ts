import { NextResponse } from "next/server";
import { ensureSettings, isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSettings();
  const body = await req.json();
  const dollars = Number(body.amount);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }
  const monthlySavingsGoalCents = dollarsToCents(dollars);
  const settings = await prisma.appSettings.update({
    where: { id: 1 },
    data: { monthlySavingsGoalCents },
  });
  return NextResponse.json({
    monthlySavingsGoalCents: settings.monthlySavingsGoalCents,
  });
}
