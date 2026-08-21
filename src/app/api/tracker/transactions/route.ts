import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { queryTrackerTransactions } from "@/lib/tracker";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function csv(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * GET /api/tracker/transactions
 * Filtered transaction list for tracker visual drill-down.
 */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });
  }

  const kindRaw = url.searchParams.get("kind") ?? "spend";
  const kind = kindRaw === "income" || kindRaw === "all" || kindRaw === "spend" ? kindRaw : "spend";

  const result = await queryTrackerTransactions({
    from,
    to,
    kind,
    category: url.searchParams.get("category") ?? undefined,
    excludeCategories: csv(url.searchParams.get("excludeCategories")),
    excludePayees: csv(url.searchParams.get("excludePayees")),
    account: url.searchParams.get("account") ?? undefined,
    payee: url.searchParams.get("payee") ?? undefined,
  });

  return NextResponse.json(result);
}
