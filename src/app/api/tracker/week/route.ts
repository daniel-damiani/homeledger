import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getWeekSnapshot, toWeekMonday } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/**
 * GET /api/tracker/week?date=YYYY-MM-DD
 * Returns WeekSnapshot for the week containing `date` (defaults to today).
 * Also returns the Monday date of that week so the client knows what it received.
 */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  let anchor: Date;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    anchor = new Date(`${dateParam}T12:00:00Z`);
  } else {
    anchor = new Date();
  }

  const snap = await getWeekSnapshot(anchor);
  const monday = toWeekMonday(anchor);

  return NextResponse.json({
    ...snap,
    resolvedWeekStart: monday.toISOString().slice(0, 10),
  });
}
