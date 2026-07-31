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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        categoryId: fd.get("categoryId"),
        limit: fd.get("limit"),
      }),
    });
    if (!res.ok) {
      setError("Could not save budget");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  async function copyPrev() {
    await fetch("/api/budgets/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Set budget · {month}</h2>
      {error ? <div className="flash error">{error}</div> : null}
      <div className="field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="limit">Monthly limit ($)</label>
        <input id="limit" name="limit" type="number" step="0.01" min="0" required />
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button className="btn" type="submit">
          Save
        </button>
        <button className="btn secondary" type="button" onClick={copyPrev}>
          Copy previous month
        </button>
      </div>
    </form>
  );
}