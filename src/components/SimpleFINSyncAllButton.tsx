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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ name: string; imported: number }[]>([]);
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);

  async function syncAll() {
    if (busy || accounts.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: accounts.length });
    setResults([]);
    setErrors([]);

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      setProgress({ done: i, total: accounts.length });
      try {
        const r = await runSync({ accountId: acc.id });
        setResults((prev) => [...prev, { name: acc.name, imported: r.imported }]);
      } catch (e) {
        setErrors((prev) => [...prev, { name: acc.name, error: e instanceof Error ? e.message : "Failed" }]);
      }
    }

    setProgress({ done: accounts.length, total: accounts.length });
    setBusy(false);
    router.refresh();
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const isDone = progress !== null && progress.done === progress.total && !busy;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <button
        className="btn"
        onClick={syncAll}
        disabled={busy || accounts.length === 0}
      >
        {busy
          ? `Syncing ${progress?.done ?? 0}/${progress?.total ?? accounts.length}…`
          : "↻ Sync all linked accounts"}
      </button>

      {isDone && (
        <span style={{ fontSize: "0.85rem" }}>
          {errors.length === 0 ? (
            <span style={{ color: "var(--ok)" }}>
              Done — +{totalImported} new transactions across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span style={{ color: "var(--amber)" }}>
              Done with {errors.length} error{errors.length !== 1 ? "s" : ""}
              {totalImported > 0 ? ` · +${totalImported} imported` : ""}
            </span>
          )}
        </span>
      )}

      {isDone && errors.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--rose)", width: "100%" }}>
          {errors.map((e) => (
            <li key={e.name}>{e.name}: {e.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
