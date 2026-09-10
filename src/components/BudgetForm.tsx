"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function BudgetForm({
  month,
  categories,
}: {
  month: string;
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
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          categoryId: fd.get("categoryId"),
          limit: fd.get("limit"),
          throughYearEnd: fd.get("throughYearEnd") === "on",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save budget");
        return;
      }
      const n = Number(data.count || 1);
      setSuccess(
        n > 1
          ? `Saved for ${n} months (${(data.months as string[])?.join(", ")}).`
          : `Saved for ${month}.`
      );
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
      const res = await fetch("/api/budgets/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not copy");
        return;
      }
      setSuccess(`Copied ${data.copied ?? 0} budget(s) from ${data.from}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Set budget · {month}</h2>
      {error ? <div className="flash error">{error}</div> : null}
      {success ? <div className="flash">{success}</div> : null}
      <div className="field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" required disabled={busy}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="limit">Monthly limit ($)</label>
        <input
          id="limit"
          name="limit"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={busy}
        />
      </div>
      <div className="field">
        <label>
          <input name="throughYearEnd" type="checkbox" disabled={busy} /> Apply
          to every month through December
        </label>
        <span className="stat muted">
          Upserts this category’s limit for {month.slice(0, 4)} remaining months.
        </span>
      </div>
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
          Copy previous month
        </button>
      </div>
    </form>
  );
}
