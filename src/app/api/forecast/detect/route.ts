import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { detectIncomePattern } from "@/lib/forecast";

export const dynamic = "force-dynamic";

/**
 * POST /api/forecast/detect
 * Body: { accountId: string, lookbackDays?: number }
 * Returns: DetectedIncome[]
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    lookbackDays?: number;
  };

  if (!body.accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const patterns = await detectIncomePattern(
    body.accountId,
    body.lookbackDays ?? 120
  );

  return NextResponse.json(patterns);
}
