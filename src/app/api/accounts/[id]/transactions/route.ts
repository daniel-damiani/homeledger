import { NextResponse } from "next/server";
import { createManualTransaction } from "@/lib/accounts";
import { dollarsToCents } from "@/lib/money";
import { isAuthenticated } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const payee = String(body.payee || "").trim();
  if (!payee) return NextResponse.json({ error: "Payee required" }, { status: 400 });
  const txn = await createManualTransaction({
    accountId: id,
    date: new Date(String(body.date) + "T12:00:00Z"),
    payee,
    memo: body.memo ? String(body.memo) : undefined,
    amountCents: dollarsToCents(Number(body.amount)),
    categoryId: body.categoryId ? String(body.categoryId) : undefined,
  });
  return NextResponse.json(txn);
}