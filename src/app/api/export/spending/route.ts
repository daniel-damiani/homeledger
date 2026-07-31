import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds } from "@/lib/money";

export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || formatMonthKey();
  const { start, end } = monthBounds(month);
  const txns = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end } },
    include: { category: true, account: true },
    orderBy: { date: "asc" },
  });

  const lines = [
    "date,account,payee,category,amount,memo",
    ...txns.map((t) =>
      [
        t.date.toISOString().slice(0, 10),
        csv(t.account.name),
        csv(t.payee),
        csv(t.category?.name ?? ""),
        (t.amountCents / 100).toFixed(2),
        csv(t.memo ?? ""),
      ].join(",")
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homeledger-spending-${month}.csv"`,
    },
  });
}

function csv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}