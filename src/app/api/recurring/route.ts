import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";
import { applyDueRecurringPayments, listRecurringPayments } from "@/lib/recurring";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await applyDueRecurringPayments();
  const items = await listRecurringPayments();
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  const payee = String(body.payee || name).trim();
  const fromAccountId = String(body.fromAccountId || "");
  const amountCents = dollarsToCents(Number(body.amount || 0));
  const dayOfMonth = Math.min(28, Math.max(1, Math.trunc(Number(body.dayOfMonth || 1))));
  if (!name || !fromAccountId || !payee || amountCents <= 0) {
    return NextResponse.json(
      { error: "name, fromAccountId, payee, and positive amount required" },
      { status: 400 }
    );
  }

  const created = await prisma.recurringPayment.create({
    data: {
      name,
      payee,
      fromAccountId,
      toAccountId: body.toAccountId ? String(body.toAccountId) : null,
      amountCents,
      dayOfMonth,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      memo: body.memo ? String(body.memo) : null,
      active: body.active !== false,
    },
  });

  // Optionally post today's occurrence immediately if day matches / is due
  if (body.postDue !== false) {
    await applyDueRecurringPayments();
  }

  return NextResponse.json(created);
}
