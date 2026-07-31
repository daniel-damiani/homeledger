"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = {
  id: string;
  payee: string;
  date: string;
  amountCents: number;
  accountName: string;
};

export function CategorizeQueue({
  items,
  categories,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function apply(txnId: string, categoryId: string, always: boolean, payee: string) {
    setBusy(txnId);
    await fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txnId, categoryId, always, payee }),
    });
    setBusy(null);
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="lede">Queue is clear — nice work.</p>;
  }

  return (
    <div className="grid" style={{ gap: "0.75rem" }}>
      {items.map((item) => (
        <div key={item.id} className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <strong>{item.payee}</strong>
              <div className="stat muted">
                {item.date} · {item.accountName} · {(item.amountCents / 100).toFixed(2)}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                id={`cat-${item.id}`}
                defaultValue=""
                disabled={busy === item.id}
                onChange={(e) => {
                  const categoryId = e.target.value;
                  if (!categoryId) return;
                  void apply(item.id, categoryId, false, item.payee);
                }}
              >
                <option value="">Categorize…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn secondary"
                type="button"
                disabled={busy === item.id}
                onClick={() => {
                  const sel = document.getElementById(`cat-${item.id}`) as HTMLSelectElement | null;
                  const categoryId = sel?.value;
                  if (!categoryId) {
                    alert("Pick a category first");
                    return;
                  }
                  void apply(item.id, categoryId, true, item.payee);
                }}
              >
                Always like this
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}