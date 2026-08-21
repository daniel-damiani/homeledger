"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  accountId: string;
  lastSyncAt: string | null;
}

export function relativeTime(isoOrNull: string | null): string {
  if (!isoOrNull) return "never synced";
  const diff = Date.now() - new Date(isoOrNull).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "synced just now";
  if (mins < 60) return `synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `synced ${hrs}h ago`;
  return `synced ${Math.floor(hrs / 24)}d ago`;
}

function ytdStart(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SyncResult {
  imported: number;
  skipped: number;
  chunksUsed: number;
  /** Non-fatal warnings from SimpleFIN (e.g. a bank connection lagging). */
  sfErrors: { msg: string }[];
}

export async function runSync(opts: {
  accountId: string;
  startDate?: string;
  endDate?: string;
}): Promise<SyncResult> {
  const res = await fetch("/api/simplefin/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountId: opts.accountId,
      ...(opts.startDate ? { startDate: opts.startDate } : {}),
      ...(opts.endDate ? { endDate: opts.endDate } : {}),
    }),
  });
  const data = await res.json() as {
    imported?: number;
    skipped?: number;
    chunksUsed?: number;
    sfErrors?: { msg: string }[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Sync failed");
  return {
    imported: data.imported ?? 0,
    skipped: data.skipped ?? 0,
    chunksUsed: data.chunksUsed ?? 1,
    sfErrors: data.sfErrors ?? [],
  };
}

export function SimpleFINSyncButton({ accountId, lastSyncAt }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [sfErrors, setSfErrors] = useState<{ msg: string }[]>([]);
  const [err, setErr] = useState("");
  const [showRange, setShowRange] = useState(false);
  const [fromDate, setFromDate] = useState(ytdStart());
  const [toDate, setToDate] = useState(today());

  async function sync(startDate?: string, endDate?: string) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setErr("");
    setSfErrors([]);
    setShowRange(false);
    try {
      const r = await runSync({ accountId, startDate, endDate });
      const chunks = r.chunksUsed > 1 ? ` · ${r.chunksUsed} API requests used` : "";
      setResult(`+${r.imported} new${chunks}`);
      setSfErrors(r.sfErrors);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="btn"
          style={{ fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
          onClick={() => sync()}
          disabled={busy}
        >
          {busy ? "Syncing…" : "↻ Sync"}
        </button>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.15rem 0.4rem", color: "var(--muted)" }}
          onClick={() => setShowRange((v) => !v)}
          disabled={busy}
          title="Sync a specific date range"
        >
          date range…
        </button>
        <span className="stat muted" style={{ fontSize: "0.78rem" }}>
          {result ?? relativeTime(lastSyncAt)}
        </span>
      </div>

      {showRange && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--muted)", minWidth: "2.5rem" }}>From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
            />
            <label style={{ fontSize: "0.78rem", color: "var(--muted)", minWidth: "1.5rem" }}>To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              style={{ fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
              onClick={() => sync(fromDate, toDate)}
              disabled={busy || !fromDate}
            >
              Sync range
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: "0.75rem", color: "var(--muted)" }}
              onClick={() => { setFromDate(ytdStart()); setToDate(today()); sync(ytdStart(), today()); }}
              disabled={busy}
              title="Year to date"
            >
              YTD
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: "0.75rem", color: "var(--muted)" }}
              onClick={() => setShowRange(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p style={{ color: "var(--rose)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>{err}</p>}

      {sfErrors.length > 0 && (
        <div style={{ marginTop: "0.3rem" }}>
          {sfErrors.map((e, i) => (
            <p key={i} style={{ color: "var(--amber)", fontSize: "0.75rem", margin: "0.1rem 0" }}>
              ⚠ {e.msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
