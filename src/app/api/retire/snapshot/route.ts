import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getOrCreateRetirementProfile,
  loadLedgerSnapshot,
} from "@/lib/retirement";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [snapshot, profile] = await Promise.all([
    loadLedgerSnapshot(),
    getOrCreateRetirementProfile(),
  ]);
  return NextResponse.json({
    snapshot,
    profile,
    ready: profile.birthYear != null,
  });
}
