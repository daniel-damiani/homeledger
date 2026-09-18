import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const year = Number(body.year);
  const categoryId = String(body.categoryId || "");
  const limitCents = dollarsToCents(Number(body.limit || 0));
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !categoryId) {
    return NextResponse.json({ error: "year and categoryId required" }, { status: 400 });
  }

  const budget = await prisma.yearlyBudget.upsert({
    where: { categoryId_year: { categoryId, year } },
    create: { categoryId, year, limitCents },
    update: { limitCents },
  });
  return NextResponse.json({ budget });
}

export async function DELETE(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const year = Number(body.year);
  const categoryId = String(body.categoryId || "");
  if (!Number.isInteger(year) || !categoryId) {
    return NextResponse.json({ error: "year and categoryId required" }, { status: 400 });
  }
  await prisma.yearlyBudget.deleteMany({ where: { categoryId, year } });
  return NextResponse.json({ ok: true });
}
