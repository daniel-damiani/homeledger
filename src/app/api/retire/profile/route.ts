import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOrCreateRetirementProfile,
  isTaxBucket,
  type RetirementProfileDTO,
  type TaxBucketKind,
} from "@/lib/retirement";

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
  await getOrCreateRetirementProfile();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Partial<RetirementProfileDTO> = {};
  if (body.birthYear !== undefined) {
    data.birthYear = optionalInt(body.birthYear, 1920, 2015) ?? null;
  }
  if (body.retireAge !== undefined) data.retireAge = intIn(body.retireAge, 40, 85, 65);
  if (body.longevityAge !== undefined) data.longevityAge = intIn(body.longevityAge, 70, 110, 95);
  if (body.ssFraMonthlyCents !== undefined) {
    data.ssFraMonthlyCents = intIn(body.ssFraMonthlyCents, 0, 50_000_00, 0);
  }
  if (body.ssClaimAge !== undefined) data.ssClaimAge = intIn(body.ssClaimAge, 62, 70, 67);
  if (body.desiredAnnualSpendCents !== undefined) {
    data.desiredAnnualSpendCents = optionalInt(body.desiredAnnualSpendCents, 0, 5_000_000_00) ?? null;
  }
  if (body.stockPct !== undefined) data.stockPct = intIn(body.stockPct, 0, 100, 70);
  if (body.glidePath !== undefined) data.glidePath = Boolean(body.glidePath);
  if (body.includeSavings !== undefined) data.includeSavings = Boolean(body.includeSavings);
  if (body.extraMonthlySaveCents !== undefined) {
    data.extraMonthlySaveCents = intIn(body.extraMonthlySaveCents, 0, 200_000_00, 0);
  }
  if (body.stockReturnPct !== undefined) data.stockReturnPct = floatIn(body.stockReturnPct, 0, 15, 7);
  if (body.bondReturnPct !== undefined) data.bondReturnPct = floatIn(body.bondReturnPct, 0, 10, 4);
  if (body.inflationPct !== undefined) data.inflationPct = floatIn(body.inflationPct, 0, 8, 2.5);
  if (body.traditionalTaxHaircutPct !== undefined) {
    data.traditionalTaxHaircutPct = intIn(body.traditionalTaxHaircutPct, 0, 40, 15);
  }

  if (data.retireAge != null && data.longevityAge != null && data.longevityAge <= data.retireAge) {
    data.longevityAge = data.retireAge + 10;
  }

  const profile = await prisma.retirementProfile.update({
    where: { id: 1 },
    data,
  });

  const buckets = Array.isArray(body.buckets) ? body.buckets : [];
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { id?: unknown; taxBucket?: unknown };
    if (typeof row.id !== "string" || !isTaxBucket(row.taxBucket)) continue;
    await prisma.account.update({
      where: { id: row.id },
      data: { taxBucket: row.taxBucket as TaxBucketKind },
    });
  }

  return NextResponse.json({
    birthYear: profile.birthYear,
    retireAge: profile.retireAge,
    longevityAge: profile.longevityAge,
    ssFraMonthlyCents: profile.ssFraMonthlyCents,
    ssClaimAge: profile.ssClaimAge,
    desiredAnnualSpendCents: profile.desiredAnnualSpendCents,
    stockPct: profile.stockPct,
    glidePath: profile.glidePath,
    includeSavings: profile.includeSavings,
    extraMonthlySaveCents: profile.extraMonthlySaveCents,
    stockReturnPct: profile.stockReturnPct,
    bondReturnPct: profile.bondReturnPct,
    inflationPct: profile.inflationPct,
    traditionalTaxHaircutPct: profile.traditionalTaxHaircutPct,
  });
}
