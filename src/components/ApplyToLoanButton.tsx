"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LoanAccount = { id: string; name: string };

export function ApplyToLoanButton({
  txnId,
  alreadyLinked,
  loanAccounts,
}: {
  txnId: string;
  alreadyLinked: boolean;
  loanAccounts: LoanAccount[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loanId, setLoanId] = useState(loanAccounts[0]?.id ?? "");
  const [always, setAlways] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (alreadyLinked) {
    return <span className="stat muted">Linked to loan</span>;
  }
  if (loanAccounts.length === 0) return null;

  async function apply() {
    if (!loanId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/transactions/${txnId}/apply-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanAccountId: loanId, always }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn secondary" type="button" onClick={() => setOpen(true)}>
        Apply to loan
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: "12rem" }}>
      {error ? <div className="flash error">{error}</div> : null}
      <select
        value={loanId}
        disabled={busy}
        onChange={(e) => setLoanId(e.target.value)}
      >
        {loanAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="stat muted">
        <input
          type="checkbox"
          checked={always}
          disabled={busy}
          onChange={(e) => setAlways(e.target.checked)}
        />{" "}
        Always for this payee
          <span className="stat muted"> (matches merchant name, e.g. HMF)</span>
      </label>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <button className="btn" type="button" disabled={busy} onClick={() => void apply()}>
          {busy ? "…" : "Apply"}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
