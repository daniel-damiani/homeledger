"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function ManualTxnForm({
  accounts,
  categories,
  defaultAccountId,
}: {
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string }[];
  defaultAccountId?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"expense" | "income" | "loan-payment">("expense");

  const loanAccounts = useMemo(
    () => accounts.filter((a) => a.type === "LOAN" || a.type === "CREDIT"),
    [accounts]
  );
  const fundingAccounts = useMemo(
    () => accounts.filter((a) => a.type !== "LOAN"),
    [accounts]
  );

  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const rawAmount = Math.abs(Number(fd.get("amount") || 0));
    if (!rawAmount) {
      setError("Enter an amount");
      setBusy(false);
      return;
    }

    try {
      if (mode === "loan-payment") {
        const fromId = String(fd.get("fromAccountId") || "");
        const toId = String(fd.get("toAccountId") || "");
        const payee = String(fd.get("payee") || "Loan payment").trim();
        const date = String(fd.get("date"));
        const categoryId = fd.get("categoryId") || undefined;
        const memo = fd.get("memo") || undefined;
        if (!fromId || !toId) {
          setError("Pick funding account and loan account");
          return;
        }
        const payload = {
          date,
          payee,
          memo,
          categoryId,
          amount: -rawAmount,
        };
        const fromRes = await fetch(`/api/accounts/${fromId}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const toRes = await fetch(`/api/accounts/${toId}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            memo: memo ? `${memo} (principal)` : "Loan principal",
          }),
        });
        if (!fromRes.ok || !toRes.ok) {
          setError("Could not record loan payment");
          return;
        }
        setMsg(`Recorded $${rawAmount.toFixed(2)} payment (checking + loan).`);
      } else {
        const accountId = String(fd.get("accountId") || defaultAccountId || "");
        const signed = mode === "income" ? rawAmount : -rawAmount;
        const res = await fetch(`/api/accounts/${accountId}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: fd.get("date"),
            payee: fd.get("payee"),
            memo: fd.get("memo"),
            amount: signed,
            categoryId: fd.get("categoryId") || undefined,
          }),
        });
        if (!res.ok) {
          setError("Failed to add transaction");
          return;
        }
        setMsg("Added");
      }
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Manual transaction</h2>
      <p className="lede">
        For loans without CSV export — record one-offs or extra principal payments here.
      </p>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? <div className="flash">{msg}</div> : null}

      <div className="field">
        <label htmlFor="mode">Type</label>
        <select
          id="mode"
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="expense">Expense / payment (debit)</option>
          <option value="income">Income / deposit (credit)</option>
          <option value="loan-payment">Loan payment (funding + loan)</option>
        </select>
      </div>

      {mode === "loan-payment" ? (
        <>
          <div className="field">
            <label htmlFor="fromAccountId">Pay from</label>
            <select
              id="fromAccountId"
              name="fromAccountId"
              required
              disabled={busy}
              defaultValue={fundingAccounts[0]?.id}
            >
              {fundingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="toAccountId">Loan account</label>
            <select id="toAccountId" name="toAccountId" required disabled={busy}>
              {loanAccounts.length === 0 ? (
                <option value="">Create a LOAN account first</option>
              ) : (
                loanAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="accountId">Account</label>
          <select
            id="accountId"
            name="accountId"
            required
            disabled={busy}
            defaultValue={defaultAccountId ?? accounts[0]?.id}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="date">Date</label>
        <input id="date" name="date" type="date" required defaultValue={today} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="payee">Payee</label>
        <input
          id="payee"
          name="payee"
          required
          disabled={busy}
          placeholder={mode === "loan-payment" ? "Hyundai Motor Finance" : "Payee"}
          defaultValue={mode === "loan-payment" ? "Hyundai Motor Finance" : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="amount">Amount ($)</label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          disabled={busy}
          placeholder="400.00"
        />
        <span className="stat muted">
          Enter a positive number — sign is handled by the type above.
        </span>
      </div>
      <div className="field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" defaultValue="" disabled={busy}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="memo">Memo</label>
        <input id="memo" name="memo" disabled={busy} placeholder="Extra principal" />
      </div>
      <button className="btn" type="submit" disabled={busy || accounts.length === 0}>
        {busy ? "Saving…" : "Add"}
      </button>
    </form>
  );
}
