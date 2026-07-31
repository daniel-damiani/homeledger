import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { createRule } from "@/lib/categorize";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const txnId = String(body.txnId || "");
  const categoryId = String(body.categoryId || "");
  if (!txnId || !categoryId) {
    return NextResponse.json({ error: "txnId and categoryId required" }, { status: 400 });
  }

  await prisma.transaction.update({
    where: { id: txnId },
    data: { categoryId },
  });

  if (body.always) {
    const payee = String(body.payee || "").trim();
    if (payee) {
      const pattern = payee.slice(0, 40).toUpperCase();
      await createRule(pattern, categoryId, 40);
    }
  }

  return NextResponse.json({ ok: true });
}