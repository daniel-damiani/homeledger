"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  accountId: string;
  accountName: string;
}

export function ResetAccountImportsButton({ accountId, accountName }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function doReset() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/imports`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(`Done — removed ${data.deletedCount} transactions. Balance restored to opening balance.`);
        setConfirming(false);
        router.refresh();
      } else {
        setResult(data.error ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <p className="tip" style={{ margin: 0 }}>{result}</p>;
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
        <span className="stat muted" style={{ fontSize: "0.85rem" }}>
          Delete <strong>all</strong> transactions for <strong>{accountName}</strong>?
        </span>
        <button
          className="btn"
          style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem", background: "var(--error, #c33)", borderColor: "var(--error, #c33)" }}
          onClick={doReset}
          disabled={busy}
        >
          {busy ? "Resetting…" : "Yes, reset"}
        </button>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.8rem" }}
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      className="btn-ghost"
      style={{ fontSize: "0.8rem", color: "var(--muted)" }}
      onClick={() => setConfirming(true)}
    >
      Reset all imports
    </button>
  );
}
