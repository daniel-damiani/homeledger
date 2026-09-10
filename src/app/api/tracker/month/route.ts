import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getMonthReviewSnapshot } from "@/lib/tracker";
import { formatMonthKey } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * GET /api/tracker/month?month=YYYY-MM
 * Returns MonthReviewSnapshot for the given month (defaults to current month).
 */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month");

  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : formatMonthKey(new Date());

  const snap = await getMonthReviewSnapshot(monthKey);
  return NextResponse.json(snap);
}
