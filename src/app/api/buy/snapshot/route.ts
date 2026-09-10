import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getOrCreatePurchasePlan, loadPurchaseLedger } from "@/lib/purchase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getOrCreatePurchasePlan();
  const snapshot = await loadPurchaseLedger(profile.lookbackMonths);
  return NextResponse.json({ snapshot, profile });
}
