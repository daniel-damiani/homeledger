"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function MonthlySavingsGoalForm({
  currentCents,
}: {
  currentCents: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setOk(false);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/settings/savings-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fd.get("amount") }),
      });
      if (!res.ok) {
        setError("Could not save monthly savings goal");
        return;
      }
      setOk(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Monthly savings goal</h2>
      <p className="stat muted" style={{ marginTop: 0 }}>
        Tracker measures this month&apos;s surplus (income − spending, transfers
        excluded) against this target. See{" "}
        <Link href="/tracker">Tracker</Link>.
      </p>
      {error ? <div className="flash error">{error}</div> : null}
      {ok ? <div className="flash">Saved.</div> : null}
      <div className="field">
        <label htmlFor="monthly-savings-amount">Target ($ / month)</label>
        <input
          id="monthly-savings-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={(currentCents / 100).toFixed(2)}
        />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save monthly goal"}
      </button>
    </form>
  );
}
