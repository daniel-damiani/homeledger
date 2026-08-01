"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type RecurringRow = {
  id: string;
  name: string;
  payee: string;
  amountCents: number;
  dayOfMonth: number;
  active: boolean;
  lastPostedOn: string | null;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
};

export function RecurringPaymentsPanel({
  accounts,
  categories,
  initial,
}: {
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string }[];
  initial: RecurringRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const funding = accounts.filter((a) => a.type !== "LOAN");
  const loans = accounts.filter((a) => a.type === "LOAN" || a.type === "CREDIT");

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          payee: fd.get("payee") || fd.get("name"),
          fromAccountId: fd.get("fromAccountId"),
          toAccountId: fd.get("toAccountId") || undefined,
          amount: fd.get("amount"),
          dayOfMonth: fd.get("dayOfMonth"),
          categoryId: fd.get("categoryId") || undefined,
          memo: fd.get("memo") || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create recurring payment");
        return;
      }
      setSuccess(`Saved “${data.name}”. Due payments are posted automatically when you open Accounts.`);
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete recurring “${name}”? Past posted transactions stay.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function applyDue() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/recurring/apply", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not apply");
        return;
      }
      setSuccess(`Posted ${data.posted ?? 0} due payment(s).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <form className="panel" onSubmit={onCreate}>
        <h2>Recurring autopay</h2>
        <p className="lede">
          For Hyundai-style loans with no export — auto-post a fixed debit each month. Optionally
          reduce a LOAN account balance too.
        </p>
        {error ? <div className="flash error">{error}</div> : null}
        {success ? <div className="flash">{success}</div> : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          <div className="field">
            <label htmlFor="rp-name">Name</label>
            <input id="rp-name" name="name" required disabled={busy} placeholder="Car payment" />
          </div>
          <div className="field">
            <label htmlFor="rp-payee">Payee</label>
            <input
              id="rp-payee"
              name="payee"
              disabled={busy}
              placeholder="Hyundai Motor Finance"
            />
          </div>
          <div className="field">
            <label htmlFor="rp-amount">Amount ($)</label>
            <input
              id="rp-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="rp-day">Day of month</label>
            <input
              id="rp-day"
              name="dayOfMonth"
              type="number"
              min={1}
              max={28}
              defaultValue={1}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="rp-from">Pay from</label>
            <select id="rp-from" name="fromAccountId" required disabled={busy}>
              {funding.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-to">Also reduce loan (optional)</label>
            <select id="rp-to" name="toAccountId" disabled={busy} defaultValue="">
              <option value="">None</option>
              {loans.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-cat">Category</label>
            <select id="rp-cat" name="categoryId" disabled={busy} defaultValue="">
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-memo">Memo</label>
            <input id="rp-memo" name="memo" disabled={busy} />
          </div>
          <button className="btn" type="submit" disabled={busy || funding.length === 0}>
            {busy ? "Saving…" : "Add recurring"}
          </button>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void applyDue()}>
            Post due now
          </button>
        </div>
      </form>

      <section className="panel">
        <h2>Scheduled</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Day</th>
                <th>From → Loan</th>
                <th>Last posted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {initial.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {!r.active ? " (paused)" : ""}
                    <div className="stat muted">{r.payee}</div>
                  </td>
                  <td>${(r.amountCents / 100).toFixed(2)}</td>
                  <td>{r.dayOfMonth}</td>
                  <td>
                    {r.fromAccount.name}
                    {r.toAccount ? ` → ${r.toAccount.name}` : ""}
                  </td>
                  <td className="stat muted">
                    {r.lastPostedOn ? r.lastPostedOn.slice(0, 10) : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void toggle(r.id, !r.active)}
                      >
                        {r.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(r.id, r.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {initial.length === 0 ? (
                <tr>
                  <td colSpan={6}>No recurring payments yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
