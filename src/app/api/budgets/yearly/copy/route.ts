import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const year = Number(body.year) || new Date().getFullYear();
  const fromYear = year - 1;
  const prev = await prisma.yearlyBudget.findMany({ where: { year: fromYear } });
  let copied = 0;
  for (const b of prev) {
    await prisma.yearlyBudget.upsert({
      where: { categoryId_year: { categoryId: b.categoryId, year } },
      create: { categoryId: b.categoryId, year, limitCents: b.limitCents },
      update: { limitCents: b.limitCents },
    });
    copied += 1;
  }
  return NextResponse.json({ copied, from: fromYear, to: year });
}
