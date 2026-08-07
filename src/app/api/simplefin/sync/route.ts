import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchSimpleFinAccounts, fetchSimpleFinChunked, simplefinRowsToParsedRows, SIMPLEFIN_CHUNK_DAYS } from "@/lib/simplefin";
import { commitImport } from "@/lib/import/commit";

export const runtime = "nodejs";

/**
 * POST /api/simplefin/sync
 * Fetches transactions for a linked HomeLedger account from SimpleFIN and imports them.
 *
 * Body: { accountId: string, startDate?: string (ISO date, overrides stored last-sync) }
 *
 * Start-date priority:
 *   1. Explicit startDate in request body (allows historical pulls)
 *   2. simpleFinLastSyncAt stored on the account (normal incremental sync)
 *   3. Jan 1 of the current year (first-ever sync default)
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { accountId?: string; startDate?: string; endDate?: string };
  const { accountId } = body;
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!account.simpleFinId) {
    return NextResponse.json({ error: "Account is not linked to SimpleFIN" }, { status: 400 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.simpleFinAccessUrl) {
    return NextResponse.json({ error: "SimpleFIN not connected" }, { status: 400 });
  }

  // Determine start date
  let startDate: Date;
  if (body.startDate) {
    startDate = new Date(body.startDate);
  } else if (account.simpleFinLastSyncAt) {
    startDate = account.simpleFinLastSyncAt;
  } else {
    // Default first sync: Jan 1 of the current year
    startDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  }

  const endDate = body.endDate ? new Date(body.endDate) : new Date();
  const rangeMs = endDate.getTime() - startDate.getTime();
  const needsChunking = rangeMs > SIMPLEFIN_CHUNK_DAYS * 24 * 60 * 60 * 1000;

  try {
    let errlist: { msg: string }[] = [];
    let chunksUsed = 0;

    // Verify the account exists in SimpleFIN before chunking
    const discoveryData = await fetchSimpleFinAccounts(settings.simpleFinAccessUrl, { balancesOnly: true });
    const sfAccMeta = discoveryData.accounts.find((a) => a.id === account.simpleFinId);
    if (!sfAccMeta) {
      const errMsgs = discoveryData.errlist?.map((e) => e.msg).join("; ");
      return NextResponse.json(
        { error: `SimpleFIN account not found in response.${errMsgs ? " Errors: " + errMsgs : ""}` },
        { status: 404 }
      );
    }

    let rawTxns;
    if (needsChunking) {
      const result = await fetchSimpleFinChunked(
        settings.simpleFinAccessUrl,
        account.simpleFinId,
        startDate,
        {
          maxChunks: Math.ceil(rangeMs / (SIMPLEFIN_CHUNK_DAYS * 24 * 60 * 60 * 1000)) + 1,
          endDate,
        },
      );
      rawTxns = result.transactions;
      errlist = result.errlist;
      chunksUsed = result.chunksUsed;
    } else {
      const data = await fetchSimpleFinAccounts(settings.simpleFinAccessUrl, { startDate, endDate });
      const sfAcc = data.accounts.find((a) => a.id === account.simpleFinId);
      rawTxns = sfAcc?.transactions ?? [];
      errlist = data.errlist ?? [];
      chunksUsed = 1;
    }

    const rows = simplefinRowsToParsedRows(rawTxns);

    let batch = null;
    if (rows.length > 0) {
      batch = await commitImport({
        accountId,
        filename: `simplefin-${account.simpleFinId}`,
        format: "simplefin",
        rows,
      });
    }

    // Update balances from SimpleFIN and record sync time
    const balanceCents = Math.round(parseFloat(sfAccMeta.balance) * 100);
    const availableRaw = sfAccMeta["available-balance"];
    const availableBalanceCents = availableRaw != null
      ? Math.round(parseFloat(availableRaw) * 100)
      : null;
    await prisma.account.update({
      where: { id: accountId },
      data: {
        balanceCents,
        availableBalanceCents,
        simpleFinLastSyncAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      imported: batch?.importedCount ?? 0,
      skipped: batch?.skippedCount ?? 0,
      chunksUsed,
      balance: sfAccMeta.balance,
      errors: errlist,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 502 }
    );
  }
}
