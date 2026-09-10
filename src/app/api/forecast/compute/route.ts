import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { computeForecast, type IncomeEntry } from "@/lib/forecast";

export const dynamic = "force-dynamic";

/**
 * POST /api/forecast/compute
 * Body: { accountId: string, incomeSchedule: IncomeEntry[], horizonDays?: number, lowThresholdCents?: number }
 * Returns: ForecastResult
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    incomeSchedule?: IncomeEntry[];
    horizonDays?: number;
    lowThresholdCents?: number;
  };

  if (!body.accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const result = await computeForecast(
    body.accountId,
    body.incomeSchedule ?? [],
    body.horizonDays ?? 60,
    body.lowThresholdCents ?? 50_000
  );

  return NextResponse.json(result);
}
