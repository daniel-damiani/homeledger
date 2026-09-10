import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.txnIds)
    ? body.txnIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const categoryId =
    typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;

  if (ids.length === 0) {
    return NextResponse.json({ error: "txnIds required" }, { status: 400 });
  }

  const { count } = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId },
  });

  return NextResponse.json({ updated: count });
}
