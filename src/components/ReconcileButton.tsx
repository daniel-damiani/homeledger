"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMoney } from "@/lib/money";

interface UnclearedTxn {
  id: string;
  date: string;
  payee: string;
  amountCents: number;
  cleared: boolean;
}

interface ReconcileData {
  clearedBalanceCents: number;
  unclearedBalanceCents: number;
  transactions: UnclearedTxn[];
}

export function ReconcileButton({
  accountId,
  accountBalanceCents,
}: {
  accountId: string;
  accountBalanceCents: number;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReconcileData | null>(null);
  const [statementInput, setStatementInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/reconcile`);
      const json = (await res.json()) as ReconcileData;
      setData(json);
    } finally {
      setBusy(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (open) {
      load();
      setStatementInput((accountBalanceCents / 100).toFixed(2));
      setMsg(null);
    }
  }, [open, load, accountBalanceCents]);

  async function toggleCleared(txnId: string, currentCleared: boolean) {
    await fetch(`/api/accounts/${accountId}/reconcile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txnId, cleared: !currentCleared }),
    });
    await load();
  }

  async function finishReconcile() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch(`/api/accounts/${accountId}/reconcile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      setMsg("Reconciled! All uncleared transactions are now marked cleared.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const statementCents = Math.round(parseFloat(statementInput || "0") * 100);
  const clearedBalance = data?.clearedBalanceCents ?? 0;
  const differenceCents = statementCents - clearedBalance;
  const isBalanced = Math.abs(differenceCents) < 1;

  if (!open) {
    return (
      <button className="btn-ghost" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }} onClick={() => setOpen(true)}>
        Reconcile
      </button>
    );
  }

  return (
    <div className="reconcile-panel">
      <div className="reconcile-header">
        <strong>Reconcile account</strong>
        <button className="btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="reconcile-fields">
        <label className="reconcile-label">Statement balance ($)</label>
        <input
          type="number"
          step="0.01"
          className="reconcile-input"
          value={statementInput}
          onChange={(e) => setStatementInput(e.target.value)}
        />
      </div>

      <div className="reconcile-summary">
        <div className="reconcile-row">
          <span>Cleared balance</span>
          <span className={clearedBalance < 0 ? "amount neg" : ""}>{formatMoney(clearedBalance)}</span>
        </div>
        <div className="reconcile-row">
          <span>Statement balance</span>
          <span>{formatMoney(statementCents)}</span>
        </div>
        <div className={`reconcile-row reconcile-diff${isBalanced ? " balanced" : ""}`}>
          <strong>Difference</strong>
          <strong className={isBalanced ? "" : differenceCents < 0 ? "amount neg" : "amount pos"}>
            {isBalanced ? "✓ Balanced" : formatMoney(differenceCents)}
          </strong>
        </div>
      </div>

      {busy && <p className="stat muted" style={{ fontSize: "0.82rem" }}>Loading…</p>}

      {data && data.transactions.length > 0 && (
        <div className="reconcile-txns">
          <p className="reconcile-hint">
            Click a row to mark it cleared. Cleared transactions count toward the cleared balance.
          </p>
          <div className="reconcile-txn-list">
            {data.transactions.map((t) => (
              <button
                key={t.id}
                className={`reconcile-txn${t.cleared ? " cleared" : ""}`}
                onClick={() => toggleCleared(t.id, t.cleared)}
              >
                <span className="reconcile-txn-check">{t.cleared ? "✓" : "○"}</span>
                <span className="reconcile-txn-date">{new Date(t.date).toLocaleDateString()}</span>
                <span className="reconcile-txn-payee">{t.payee}</span>
                <span className={`reconcile-txn-amt${t.amountCents < 0 ? " amount neg" : " amount pos"}`}>
                  {formatMoney(t.amountCents)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data && data.transactions.length === 0 && !busy && (
        <p className="stat muted" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
          All transactions are already cleared.
        </p>
      )}

      {msg && <p className="tip success" style={{ marginTop: "0.75rem" }}>{msg}</p>}

      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {isBalanced && data && data.transactions.length > 0 && (
          <button className="btn" onClick={finishReconcile} disabled={busy}>
            Finish reconciliation
          </button>
        )}
        {!isBalanced && data && data.transactions.length > 0 && (
          <button className="btn secondary" onClick={finishReconcile} disabled={busy}>
            Mark all cleared anyway
          </button>
        )}
      </div>
    </div>
  );
}
