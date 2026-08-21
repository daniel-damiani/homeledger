import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  fetchSimpleFinAccounts,
  fetchSimpleFinChunked,
  simplefinRowsToParsedRows,
  SIMPLEFIN_CHUNK_DAYS,
  type SimpleFINAccount,
} from "@/lib/simplefin";
import { commitImport } from "@/lib/import/commit";

export const runtime = "nodejs";

/**
 * POST /api/simplefin/sync
 * Fetches transactions for a linked HomeLedger account from SimpleFIN and imports them.
 *
 * Uses exactly 1 SimpleFIN API request for a normal incremental sync (< 85 days).
 * Uses N requests for chunked historical syncs (one per 85-day window).
 * The SimpleFIN API has a limit of 24 requests/day.
 *
 * Body: { accountId: string, startDate?: string (ISO), endDate?: string (ISO) }
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

  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    startDate?: string;
    endDate?: string;
  };
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

  // Determine date window.
  // For incremental syncs we apply a 7-day overlap so that transactions which
  // post retroactively at the bank (after our last sync ran) are still caught
  // on the next sync.  SimpleFIN itself recommends ~5 days of overlap; we use
  // 7 to be conservative.  Duplicates are harmless: commitImport deduplicates
  // via the stable `sfin-{id}` externalId.
  const INCREMENTAL_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;
  let startDate: Date;
  if (body.startDate) {
    startDate = new Date(body.startDate);
  } else if (account.simpleFinLastSyncAt) {
    startDate = new Date(account.simpleFinLastSyncAt.getTime() - INCREMENTAL_OVERLAP_MS);
  } else {
    startDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  }
  const endDate = body.endDate ? new Date(body.endDate) : new Date();

  const rangeMs = endDate.getTime() - startDate.getTime();
  const needsChunking = rangeMs > SIMPLEFIN_CHUNK_DAYS * 24 * 60 * 60 * 1000;

  try {
    let sfAccMeta: SimpleFINAccount | null = null;
    let rawTxns: Awaited<ReturnType<typeof simplefinRowsToParsedRows>> = [];
    let errlist: { msg: string }[] = [];
    let chunksUsed = 0;

    if (needsChunking) {
      // Multiple requests — one per 85-day chunk. No separate discovery call needed
      // because each chunk returns account data (balance, etc.) which we keep.
      const result = await fetchSimpleFinChunked(
        settings.simpleFinAccessUrl,
        account.simpleFinId,
        startDate,
        {
          maxChunks: Math.ceil(rangeMs / (SIMPLEFIN_CHUNK_DAYS * 24 * 60 * 60 * 1000)) + 1,
          endDate,
        }
      );
      rawTxns = simplefinRowsToParsedRows(result.transactions);
      errlist = result.errlist;
      chunksUsed = result.chunksUsed;
      sfAccMeta = result.latestAccount;

      // Rare edge-case: chunking completed but the account never appeared in any chunk.
      // Do a single balances-only call to get current balance/verify the account exists.
      if (!sfAccMeta) {
        const bData = await fetchSimpleFinAccounts(settings.simpleFinAccessUrl, { balancesOnly: true });
        chunksUsed += 1;
        errlist = [...errlist, ...(bData.errlist ?? [])];
        sfAccMeta = bData.accounts.find((a) => a.id === account.simpleFinId) ?? null;
      }
    } else {
      // Single request — fetches transactions AND balance/available-balance in one call.
      const data = await fetchSimpleFinAccounts(settings.simpleFinAccessUrl, {
        startDate,
        endDate,
      });
      chunksUsed = 1;
      errlist = data.errlist ?? [];
      sfAccMeta = data.accounts.find((a) => a.id === account.simpleFinId) ?? null;

      if (!sfAccMeta) {
        const errMsgs = errlist.map((e) => e.msg).join("; ");
        return NextResponse.json(
          {
            error: `This account was not found in your SimpleFIN data.${errMsgs ? " SimpleFIN errors: " + errMsgs : ""}`,
            sfErrors: errlist,
          },
          { status: 404 }
        );
      }
      rawTxns = simplefinRowsToParsedRows(sfAccMeta.transactions ?? []);
    }

    // Import transactions
    let batch = null;
    if (rawTxns.length > 0) {
      batch = await commitImport({
        accountId,
        filename: `simplefin-${account.simpleFinId}`,
        format: "simplefin",
        rows: rawTxns,
      });
    }

    // Update balance from SimpleFIN's response (more authoritative than our running total)
    if (sfAccMeta) {
      const balanceCents = Math.round(parseFloat(sfAccMeta.balance) * 100);
      const availableRaw = sfAccMeta["available-balance"];
      const availableBalanceCents =
        availableRaw != null ? Math.round(parseFloat(availableRaw) * 100) : null;
      await prisma.account.update({
        where: { id: accountId },
        data: { balanceCents, availableBalanceCents, simpleFinLastSyncAt: new Date() },
      });
    } else {
      // Still record sync time even if balance couldn't be updated
      await prisma.account.update({
        where: { id: accountId },
        data: { simpleFinLastSyncAt: new Date() },
      });
    }

    return NextResponse.json({
      ok: true,
      imported: batch?.importedCount ?? 0,
      skipped: batch?.skippedCount ?? 0,
      chunksUsed,
      balance: sfAccMeta?.balance ?? null,
      // sfErrors are non-fatal warnings from SimpleFIN (e.g. a bank connection lagging)
      sfErrors: errlist,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 502 }
    );
  }
}
