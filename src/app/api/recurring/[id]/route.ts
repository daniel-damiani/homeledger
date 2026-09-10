import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";
import { applyDueRecurringPayments } from "@/lib/recurring";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (body.payee != null) data.payee = String(body.payee).trim();
  if (body.fromAccountId != null) data.fromAccountId = String(body.fromAccountId);
  if (body.toAccountId !== undefined) {
    data.toAccountId = body.toAccountId ? String(body.toAccountId) : null;
  }
  if (body.amount != null) data.amountCents = dollarsToCents(Number(body.amount));
  if (body.dayOfMonth != null) {
    data.dayOfMonth = Math.min(28, Math.max(1, Math.trunc(Number(body.dayOfMonth))));
  }
  if (body.categoryId !== undefined) {
    data.categoryId = body.categoryId ? String(body.categoryId) : null;
  }
  if (body.memo !== undefined) data.memo = body.memo ? String(body.memo) : null;
  if (body.active != null) data.active = Boolean(body.active);

  try {
    const updated = await prisma.recurringPayment.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await prisma.recurringPayment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  // Force-post one occurrence for this rule today (or given date)
  const rule = await prisma.recurringPayment.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "apply-due") {
    const result = await applyDueRecurringPayments();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
