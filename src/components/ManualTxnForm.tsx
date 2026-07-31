"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ManualTxnForm({
  accountId,
  categories,
}: {
  accountId: string;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/accounts/${accountId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fd.get("date"),
        payee: fd.get("payee"),
        memo: fd.get("memo"),
        amount: fd.get("amount"),
        categoryId: fd.get("categoryId") || undefined,
      }),
    });
    if (!res.ok) {
      setMsg("Failed to add transaction");
      return;
    }
    setMsg("Added");
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h3>Manual transaction</h3>
      {msg ? <div className="flash">{msg}</div> : null}
      <div className="field">
        <label htmlFor="date">Date</label>
        <input id="date" name="date" type="date" required />
      </div>
      <div className="field">
        <label htmlFor="payee">Payee</label>
        <input id="payee" name="payee" required />
      </div>
      <div className="field">
        <label htmlFor="amount">Amount (negative = expense)</label>
        <input id="amount" name="amount" type="number" step="0.01" required />
      </div>
      <div className="field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" defaultValue="">
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
        <input id="memo" name="memo" />
      </div>
      <button className="btn" type="submit">
        Add
      </button>
    </form>
  );
}