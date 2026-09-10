"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runSync } from "./SimpleFINSyncButton";

interface LinkedAccount {
  id: string;
  name: string;
}

export function SimpleFINSyncAllButton({ accounts }: { accounts: LinkedAccount[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; currentName: string } | null>(null);
  const [results, setResults] = useState<{ name: string; imported: number; requests: number }[]>([]);
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);
  const [sfWarnings, setSfWarnings] = useState<{ account: string; msg: string }[]>([]);

  async function syncAll() {
    if (busy || accounts.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: accounts.length, currentName: accounts[0]?.name ?? "" });
    setResults([]);
    setErrors([]);
    setSfWarnings([]);

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      setProgress({ done: i, total: accounts.length, currentName: acc.name });
      try {
        const r = await runSync({ accountId: acc.id });
        setResults((prev) => [...prev, { name: acc.name, imported: r.imported, requests: r.chunksUsed }]);
        if (r.sfErrors.length > 0) {
          setSfWarnings((prev) => [
            ...prev,
            ...r.sfErrors.map((e) => ({ account: acc.name, msg: e.msg })),
          ]);
        }
      } catch (e) {
        setErrors((prev) => [
          ...prev,
          { name: acc.name, error: e instanceof Error ? e.message : "Failed" },
        ]);
      }
    }

    setProgress({ done: accounts.length, total: accounts.length, currentName: "" });
    setBusy(false);
    router.refresh();
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalRequests = results.reduce((s, r) => s + r.requests, 0);
  const isDone = progress !== null && progress.done === progress.total && !busy;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={syncAll}
          disabled={busy || accounts.length === 0}
        >
          {busy
            ? `Syncing ${progress?.done ?? 0}/${progress?.total ?? accounts.length} · ${progress?.currentName ?? ""}…`
            : "↻ Sync all linked accounts"}
        </button>

        {isDone && (
          <span style={{ fontSize: "0.85rem" }}>
            {errors.length === 0 ? (
              <span style={{ color: "var(--ok)" }}>
                Done — +{totalImported} new across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                {totalRequests > 0 && (
                  <span className="stat muted" style={{ marginLeft: "0.5rem", fontSize: "0.78rem" }}>
                    ({totalRequests} API request{totalRequests !== 1 ? "s" : ""} used)
                  </span>
                )}
              </span>
            ) : (
              <span style={{ color: "var(--amber)" }}>
                Done with {errors.length} error{errors.length !== 1 ? "s" : ""}
                {totalImported > 0 ? ` · +${totalImported} imported` : ""}
              </span>
            )}
          </span>
        )}
      </div>

      {isDone && errors.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--rose)" }}>
          {errors.map((e) => (
            <li key={e.name}><strong>{e.name}</strong>: {e.error}</li>
          ))}
        </ul>
      )}

      {isDone && sfWarnings.length > 0 && (
        <div style={{ fontSize: "0.78rem", color: "var(--amber)" }}>
          <strong>SimpleFIN warnings:</strong>
          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.25rem" }}>
            {sfWarnings.map((w, i) => (
              <li key={i}><strong>{w.account}</strong>: {w.msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
