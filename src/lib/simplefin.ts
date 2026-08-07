import type { ParsedRow } from "./import/parsers";

// ---------------------------------------------------------------------------
// SimpleFIN protocol types
// ---------------------------------------------------------------------------

export interface SimpleFINTransaction {
  id: string;
  posted: number; // Unix epoch
  amount: string; // signed numeric string, positive = deposit
  description: string;
  transacted_at?: number;
  pending?: boolean;
}

export interface SimpleFINAccount {
  id: string;
  name: string;
  conn_id: string;
  conn_name?: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  transactions?: SimpleFINTransaction[];
}

export interface SimpleFINConnection {
  conn_id: string;
  name: string;
  org_id: string;
  org_url?: string;
  sfin_url: string;
}

export interface SimpleFINError {
  code: string;
  msg: string;
  conn_id?: string;
  account_id?: string;
}

export interface SimpleFINAccountSet {
  errlist: SimpleFINError[];
  connections: SimpleFINConnection[];
  accounts: SimpleFINAccount[];
}

// ---------------------------------------------------------------------------
// Token claim
// ---------------------------------------------------------------------------

/**
 * Claim a SimpleFIN Token (Base64-encoded URL) to get a permanent Access URL.
 * This is a one-time operation — the token is consumed on success.
 * Returns the Access URL string (contains embedded Basic Auth credentials).
 */
export async function claimToken(rawToken: string): Promise<string> {
  const claimUrl = Buffer.from(rawToken.trim(), "base64").toString("utf8");
  if (!claimUrl.startsWith("https://")) {
    throw new Error(`Decoded token is not an HTTPS URL: ${claimUrl.slice(0, 60)}`);
  }
  const res = await fetch(claimUrl, { method: "POST" });
  if (res.status === 403) {
    throw new Error(
      "SimpleFIN token has already been claimed or is invalid. Generate a new token at bridge.simplefin.org."
    );
  }
  if (!res.ok) {
    throw new Error(`SimpleFIN claim failed: HTTP ${res.status}`);
  }
  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith("https://")) {
    throw new Error(`Unexpected Access URL format: ${accessUrl.slice(0, 60)}`);
  }
  return accessUrl;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

// SimpleFIN enforces a maximum 90-day window per request.
export const SIMPLEFIN_CHUNK_DAYS = 85; // use 85 to stay safely under

/**
 * Fetch accounts (and optionally transactions) from the SimpleFIN Bridge.
 * A single call is limited to a 90-day window by the bridge.
 * Use fetchSimpleFinChunked for longer date ranges.
 */
export async function fetchSimpleFinAccounts(
  accessUrl: string,
  opts: {
    startDate?: Date;
    endDate?: Date;
    balancesOnly?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<SimpleFINAccountSet> {
  const url = new URL(`${accessUrl}/accounts`);
  if (opts.balancesOnly) {
    url.searchParams.set("balances-only", "1");
  } else {
    if (opts.startDate) {
      url.searchParams.set("start-date", String(Math.floor(opts.startDate.getTime() / 1000)));
    }
    if (opts.endDate) {
      url.searchParams.set("end-date", String(Math.floor(opts.endDate.getTime() / 1000)));
    }
  }

  // Node.js fetch rejects URLs with embedded credentials.
  // Extract them and send as a Basic Authorization header instead.
  const parsedUrl = new URL(url.toString());
  const username = parsedUrl.username;
  const password = parsedUrl.password;
  parsedUrl.username = "";
  parsedUrl.password = "";

  const headers: Record<string, string> = {};
  if (username || password) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  const timeoutMs = opts.timeoutMs ?? 90_000;
  const res = await fetch(parsedUrl.toString(), {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 402) throw new Error("SimpleFIN subscription payment required.");
  if (res.status === 403) throw new Error("SimpleFIN access denied — token may have been revoked.");
  if (!res.ok) throw new Error(`SimpleFIN fetch failed: HTTP ${res.status}`);

  return res.json() as Promise<SimpleFINAccountSet>;
}

/**
 * Fetch transactions for a specific SimpleFIN account over an arbitrarily long date range
 * by breaking it into SIMPLEFIN_CHUNK_DAYS-day windows and walking forward.
 *
 * Stops early when a chunk returns zero transactions (bank has no more history).
 * Returns all unique transactions (deduped by id) and the latest errlist.
 *
 * @param maxChunks  Safety cap on number of API calls (default 6 ≈ ~510 days). Each chunk
 *                   uses one of the 24 daily quota requests for this Access URL.
 */
export async function fetchSimpleFinChunked(
  accessUrl: string,
  simpleFinAccountId: string,
  startDate: Date,
  opts: { maxChunks?: number; timeoutMs?: number; endDate?: Date } = {}
): Promise<{ transactions: SimpleFINTransaction[]; errlist: SimpleFINError[]; chunksUsed: number }> {
  const maxChunks = opts.maxChunks ?? 6;
  const chunkMs = SIMPLEFIN_CHUNK_DAYS * 24 * 60 * 60 * 1000;
  const now = opts.endDate ?? new Date();

  const seen = new Set<string>();
  const allTransactions: SimpleFINTransaction[] = [];
  let lastErrlist: SimpleFINError[] = [];
  let chunksUsed = 0;
  let consecutiveEmpty = 0;

  let chunkStart = new Date(startDate);

  while (chunkStart < now && chunksUsed < maxChunks) {
    const chunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, now.getTime()));

    const data = await fetchSimpleFinAccounts(accessUrl, {
      startDate: chunkStart,
      endDate: chunkEnd,
      timeoutMs: opts.timeoutMs,
    });
    chunksUsed += 1;
    lastErrlist = data.errlist ?? [];

    const sfAcc = data.accounts.find((a) => a.id === simpleFinAccountId);
    const txns = sfAcc?.transactions ?? [];
    const newTxns = txns.filter((t) => !seen.has(t.id));
    newTxns.forEach((t) => seen.add(t.id));
    allTransactions.push(...newTxns);

    if (newTxns.length === 0) {
      consecutiveEmpty += 1;
      // Stop after 2 consecutive empty chunks — bank has no more history
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
    }

    // Advance by chunk size, overlapping by 5 days to catch late-posting transactions
    chunkStart = new Date(chunkEnd.getTime() - 5 * 24 * 60 * 60 * 1000);
  }

  return { transactions: allTransactions, errlist: lastErrlist, chunksUsed };
}

// ---------------------------------------------------------------------------
// Row conversion
// ---------------------------------------------------------------------------

function parseSimpleFinAmount(amount: string): number {
  const n = parseFloat(amount.replace(/,/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Convert SimpleFIN transactions to the ParsedRow format used by commitImport.
 * Uses the SimpleFIN transaction `id` as externalId with realId = true so the
 * primary-key dedup path is used (no content-based cross-format dedup).
 */
export function simplefinRowsToParsedRows(txns: SimpleFINTransaction[]): ParsedRow[] {
  return txns.map((t) => {
    // Prefer transacted_at (when the transaction happened) over posted (when it cleared).
    const ts = t.transacted_at ?? t.posted;
    const date =
      ts && ts > 0
        ? new Date(Date.UTC(
            new Date(ts * 1000).getUTCFullYear(),
            new Date(ts * 1000).getUTCMonth(),
            new Date(ts * 1000).getUTCDate(),
            12,
          ))
        : new Date();

    return {
      date,
      payee: (t.description || "SimpleFIN transaction").trim(),
      amountCents: parseSimpleFinAmount(t.amount),
      externalId: `sfin-${t.id}`,
      realId: true,
      pending: t.pending === true,
    };
  });
}
