import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { buildRetirementTips, computeRetirementPlan, type RetirementOverrides } from "@/lib/retirement";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as RetirementOverrides;
  const overrides: RetirementOverrides = {};
  if (typeof body.birthYear === "number") overrides.birthYear = body.birthYear;
  if (typeof body.retireAge === "number") overrides.retireAge = body.retireAge;
  if (typeof body.extraMonthlySaveCents === "number") {
    overrides.extraMonthlySaveCents = body.extraMonthlySaveCents;
  }
  if (typeof body.annualSpendCents === "number") overrides.annualSpendCents = body.annualSpendCents;
  if (typeof body.ssClaimAge === "number") overrides.ssClaimAge = body.ssClaimAge;
  if (typeof body.stockPct === "number") overrides.stockPct = body.stockPct;
  if (typeof body.glidePath === "boolean") overrides.glidePath = body.glidePath;
  if (typeof body.includeSavings === "boolean") overrides.includeSavings = body.includeSavings;

  const out = await computeRetirementPlan(overrides);
  if (!out.result) {
    return NextResponse.json({ error: out.error || "Cannot compute" }, { status: 400 });
  }
  return NextResponse.json({
    ...out.result,
    tips: buildRetirementTips(out.result),
  });
}
