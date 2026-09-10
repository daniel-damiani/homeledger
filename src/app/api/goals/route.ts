import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const goal = await prisma.goal.create({
    data: {
      name,
      targetCents: dollarsToCents(Number(body.target || 0)),
      currentCents: dollarsToCents(Number(body.current || 0)),
      targetDate: body.targetDate ? new Date(String(body.targetDate) + "T12:00:00Z") : null,
    },
  });
  return NextResponse.json(goal);
}