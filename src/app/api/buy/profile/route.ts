import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOrCreatePurchasePlan,
  isPurchaseKind,
  type PurchasePlanDTO,
} from "@/lib/purchase";

export const dynamic = "force-dynamic";

function intIn(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

function floatIn(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function optionalInt(v: unknown, lo: number, hi: number): number | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

export async function PUT(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await getOrCreatePurchasePlan();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Partial<PurchasePlanDTO> = {};

  if (isPurchaseKind(body.kind)) data.kind = body.kind;
  if (body.extraMonthlySaveCents !== undefined) {
    data.extraMonthlySaveCents = intIn(body.extraMonthlySaveCents, 0, 200_000_00, 0);
  }
  if (body.plannedMonthlySaveCents !== undefined) {
    data.plannedMonthlySaveCents = optionalInt(body.plannedMonthlySaveCents, 0, 200_000_00) ?? null;
  }
  if (body.extraIncomeCents !== undefined) {
    data.extraIncomeCents = intIn(body.extraIncomeCents, 0, 200_000_00, 0);
  }
  if (body.incomeOverrideCents !== undefined) {
    data.incomeOverrideCents = optionalInt(body.incomeOverrideCents, 0, 200_000_00) ?? null;
  }
  if (body.otherDebtMonthlyCents !== undefined) {
    data.otherDebtMonthlyCents = intIn(body.otherDebtMonthlyCents, 0, 200_000_00, 0);
  }
  if (body.replaceHousing !== undefined) data.replaceHousing = Boolean(body.replaceHousing);
  if (body.emergencyMonths !== undefined) data.emergencyMonths = floatIn(body.emergencyMonths, 0, 12, 3);
  if (body.lookbackMonths !== undefined) data.lookbackMonths = intIn(body.lookbackMonths, 1, 24, 12);
  if (body.otherCashCents !== undefined) {
    data.otherCashCents = intIn(body.otherCashCents, 0, 50_000_000_00, 0);
  }
  if (body.grossAnnualIncomeCents !== undefined) {
    data.grossAnnualIncomeCents = optionalInt(body.grossAnnualIncomeCents, 0, 20_000_000_00) ?? null;
  }

  if (body.housePriceCents !== undefined) data.housePriceCents = intIn(body.housePriceCents, 0, 50_000_000_00, 0);
  if (body.downPct !== undefined) data.downPct = floatIn(body.downPct, 0, 100, 20);
  if (body.mortgageRatePct !== undefined) data.mortgageRatePct = floatIn(body.mortgageRatePct, 0, 20, 6.5);
  if (body.mortgageTermYears !== undefined) data.mortgageTermYears = intIn(body.mortgageTermYears, 10, 40, 30);
  if (body.propertyTaxPct !== undefined) data.propertyTaxPct = floatIn(body.propertyTaxPct, 0, 5, 1);
  if (body.insuranceAnnualCents !== undefined) {
    data.insuranceAnnualCents = intIn(body.insuranceAnnualCents, 0, 50_000_00, 0);
  }
  if (body.hoaMonthlyCents !== undefined) data.hoaMonthlyCents = intIn(body.hoaMonthlyCents, 0, 20_000_00, 0);
  if (body.pmiAnnualPct !== undefined) data.pmiAnnualPct = floatIn(body.pmiAnnualPct, 0, 3, 0.5);
  if (body.maintenancePct !== undefined) data.maintenancePct = floatIn(body.maintenancePct, 0, 5, 1);
  if (body.closingCostPct !== undefined) data.closingCostPct = floatIn(body.closingCostPct, 0, 10, 3);
  if (body.closingCostOverrideCents !== undefined) {
    data.closingCostOverrideCents = optionalInt(body.closingCostOverrideCents, 0, 5_000_000_00) ?? null;
  }

  if (body.carPriceCents !== undefined) data.carPriceCents = intIn(body.carPriceCents, 0, 5_000_000_00, 0);
  if (body.carTaxPct !== undefined) data.carTaxPct = floatIn(body.carTaxPct, 0, 15, 6);
  if (body.carFeesCents !== undefined) data.carFeesCents = intIn(body.carFeesCents, 0, 50_000_00, 0);
  if (body.carDownPct !== undefined) data.carDownPct = floatIn(body.carDownPct, 0, 100, 10);
  if (body.carRatePct !== undefined) data.carRatePct = floatIn(body.carRatePct, 0, 25, 7);
  if (body.carTermMonths !== undefined) data.carTermMonths = intIn(body.carTermMonths, 12, 96, 60);
  if (body.carInsuranceMonthlyCents !== undefined) {
    data.carInsuranceMonthlyCents = intIn(body.carInsuranceMonthlyCents, 0, 20_000_00, 0);
  }

  if (body.cashTargetCents !== undefined) data.cashTargetCents = intIn(body.cashTargetCents, 0, 50_000_000_00, 0);
  if (body.cashSavedOverrideCents !== undefined) {
    data.cashSavedOverrideCents = optionalInt(body.cashSavedOverrideCents, 0, 50_000_000_00) ?? null;
  }

  const profile = await prisma.purchasePlan.update({ where: { id: 1 }, data });
  return NextResponse.json({
    kind: profile.kind,
    extraMonthlySaveCents: profile.extraMonthlySaveCents,
    plannedMonthlySaveCents: profile.plannedMonthlySaveCents,
    extraIncomeCents: profile.extraIncomeCents,
    incomeOverrideCents: profile.incomeOverrideCents,
    otherDebtMonthlyCents: profile.otherDebtMonthlyCents,
    replaceHousing: profile.replaceHousing,
    emergencyMonths: profile.emergencyMonths,
    lookbackMonths: profile.lookbackMonths,
    otherCashCents: profile.otherCashCents,
    grossAnnualIncomeCents: profile.grossAnnualIncomeCents,
    housePriceCents: profile.housePriceCents,
    downPct: profile.downPct,
    mortgageRatePct: profile.mortgageRatePct,
    mortgageTermYears: profile.mortgageTermYears,
    propertyTaxPct: profile.propertyTaxPct,
    insuranceAnnualCents: profile.insuranceAnnualCents,
    hoaMonthlyCents: profile.hoaMonthlyCents,
    pmiAnnualPct: profile.pmiAnnualPct,
    maintenancePct: profile.maintenancePct,
    closingCostPct: profile.closingCostPct,
    closingCostOverrideCents: profile.closingCostOverrideCents,
    carPriceCents: profile.carPriceCents,
    carTaxPct: profile.carTaxPct,
    carFeesCents: profile.carFeesCents,
    carDownPct: profile.carDownPct,
    carRatePct: profile.carRatePct,
    carTermMonths: profile.carTermMonths,
    carInsuranceMonthlyCents: profile.carInsuranceMonthlyCents,
    cashTargetCents: profile.cashTargetCents,
    cashSavedOverrideCents: profile.cashSavedOverrideCents,
  });
}
