import { NextResponse } from "next/server";
import { AccountType } from "@prisma/client";
import { createAccount } from "@/lib/accounts";
import { dollarsToCents } from "@/lib/money";
import { isAuthenticated } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const type = (body.type as AccountType) || AccountType.CHECKING;
  const balanceCents = dollarsToCents(Number(body.balance || 0));
  const account = await createAccount({
    name,
    type,
    institution: body.institution ? String(body.institution) : undefined,
    balanceCents,
  });
  return NextResponse.json(account);
}