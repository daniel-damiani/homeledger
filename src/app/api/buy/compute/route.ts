import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  buildPurchaseTips,
  computePurchasePlan,
  isPurchaseKind,
  type PurchaseOverrides,
} from "@/lib/purchase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as PurchaseOverrides;
  const overrides: PurchaseOverrides = {};
  if (isPurchaseKind(body.kind)) overrides.kind = body.kind;
  const nums: (keyof PurchaseOverrides)[] = [
    "extraMonthlySaveCents",
    "plannedMonthlySaveCents",
    "extraIncomeCents",
    "incomeOverrideCents",
    "otherDebtMonthlyCents",
    "emergencyMonths",
    "lookbackMonths",
    "otherCashCents",
    "grossAnnualIncomeCents",
    "housePriceCents",
    "downPct",
    "mortgageRatePct",
    "mortgageTermYears",
    "propertyTaxPct",
    "insuranceAnnualCents",
    "hoaMonthlyCents",
    "pmiAnnualPct",
    "maintenancePct",
    "closingCostPct",
    "closingCostOverrideCents",
    "carPriceCents",
    "carTaxPct",
    "carFeesCents",
    "carDownPct",
    "carRatePct",
    "carTermMonths",
    "carInsuranceMonthlyCents",
    "cashTargetCents",
    "cashSavedOverrideCents",
  ];
  for (const k of nums) {
    const v = body[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      (overrides as Record<string, unknown>)[k] = v;
    }
  }
  if (typeof body.replaceHousing === "boolean") overrides.replaceHousing = body.replaceHousing;
  if (body.cashSavedOverrideCents === null) overrides.cashSavedOverrideCents = null;
  if (body.incomeOverrideCents === null) overrides.incomeOverrideCents = null;
  if (body.closingCostOverrideCents === null) overrides.closingCostOverrideCents = null;
  if (body.grossAnnualIncomeCents === null) overrides.grossAnnualIncomeCents = null;
  if (body.plannedMonthlySaveCents === null) overrides.plannedMonthlySaveCents = null;

  const out = await computePurchasePlan(overrides);
  return NextResponse.json({
    ...out.result,
    snapshot: out.snapshot,
    tips: buildPurchaseTips(out.result),
  });
}
