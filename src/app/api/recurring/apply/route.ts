import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { applyDueRecurringPayments } from "@/lib/recurring";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await applyDueRecurringPayments();
  return NextResponse.json(result);
}
