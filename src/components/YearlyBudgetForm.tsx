"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function YearlyBudgetForm({
  year,
  categories,
}: {
  year: number;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/budgets/yearly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          categoryId: fd.get("categoryId"),
          limit: fd.get("limit"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save yearly budget");
        return;
      }
      setSuccess(`Saved ${year} yearly budget.`);
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyPrev() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/budgets/yearly/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not copy");
        return;
      }
      setSuccess(`Copied ${data.copied ?? 0} yearly budget(s) from ${data.from}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Set yearly budget · {year}</h2>
      {error ? <div className="flash error">{error}</div> : null}
      {success ? <div className="flash">{success}</div> : null}
      <div className="field">
        <label htmlFor="yearlyCategoryId">Category</label>
        <select id="yearlyCategoryId" name="categoryId" required disabled={busy}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="yearlyLimit">Yearly limit ($)</label>
        <input
          id="yearlyLimit"
          name="limit"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={busy}
        />
      </div>
      <p className="stat muted" style={{ marginTop: 0 }}>
        Tracked against year-to-date spending on the Tracker YTD view. Independent of monthly budgets.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={() => void copyPrev()}
        >
          Copy previous year
        </button>
      </div>
    </form>
  );
}
