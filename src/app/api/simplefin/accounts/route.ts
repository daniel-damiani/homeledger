import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchSimpleFinAccounts } from "@/lib/simplefin";

/**
 * GET /api/simplefin/accounts
 * Returns the live account list from the SimpleFIN Bridge (balances only, no transactions).
 * Also includes which HomeLedger account each SimpleFIN account is linked to (if any).
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.simpleFinAccessUrl) {
    return NextResponse.json({ error: "SimpleFIN not connected." }, { status: 400 });
  }

  try {
    const data = await fetchSimpleFinAccounts(settings.simpleFinAccessUrl, { balancesOnly: true });

    // Get all HomeLedger accounts that have a simpleFinId set
    const linked = await prisma.account.findMany({
      where: { simpleFinId: { not: null } },
      select: { id: true, name: true, simpleFinId: true, simpleFinLastSyncAt: true },
    });
    const linkedMap = new Map(linked.map((a) => [a.simpleFinId!, a]));

    const accounts = data.accounts.map((sfAcc) => ({
      id: sfAcc.id,
      name: sfAcc.name,
      conn_name: sfAcc.conn_name ?? "",
      currency: sfAcc.currency,
      balance: sfAcc.balance,
      balanceDate: sfAcc["balance-date"],
      linkedAccount: linkedMap.get(sfAcc.id) ?? null,
    }));

    return NextResponse.json({
      accounts,
      errors: data.errlist ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch accounts" },
      { status: 502 }
    );
  }
}
