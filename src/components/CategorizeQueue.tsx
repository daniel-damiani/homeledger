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
  const [suggesting, setSuggesting] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  async function apply(txnId: string, always: boolean, payee: string) {
    const categoryId = picked[txnId];
    if (!categoryId) {
      alert("Pick a category first");
      return;
    }
    setBusy(txnId);
    try {
      await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txnId, categoryId, always, payee }),
      });
      setPicked((prev) => {
        const next = { ...prev };
        delete next[txnId];
        return next;
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function suggestWithOllama() {
    setSuggesting(true);
    setError("");
    setFlash("");
    try {
      const res = await fetch("/api/categorize/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txnIds: items.map((i) => i.id) }),
        signal: AbortSignal.timeout(600_000),
      });
      const data = (await res.json()) as {
        suggestions?: Record<string, string>;
        error?: string;
        warning?: string;
      };
      if (!res.ok) {
        setError(data.error || "Suggest failed");
        return;
      }
      const suggestions = data.suggestions ?? {};
      setPicked((prev) => ({ ...prev, ...suggestions }));
      const n = Object.keys(suggestions).length;
      setFlash(
        n
          ? `Filled ${n} suggestion${n === 1 ? "" : "s"} — review and Apply.`
          : "No confident suggestions — pick categories manually."
      );
      if (data.warning) setError(data.warning);
    } catch {
      setError("Could not reach suggest API");
    } finally {
      setSuggesting(false);
    }
  }

  if (items.length === 0) {
    return <p className="lede">Queue is clear — nice work.</p>;
  }

  return (
    <div className="grid" style={{ gap: "0.75rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
          alignItems: "center",
          marginBottom: "0.25rem",
        }}
      >
        <button
          className="btn"
          type="button"
          disabled={suggesting}
          onClick={() => void suggestWithOllama()}
        >
          {suggesting ? "Suggesting…" : "Suggest with Ollama"}
        </button>
        <span className="stat muted">
          Fills the dropdowns; you still confirm Apply once / Always.
        </span>
      </div>
      {flash ? <div className="flash">{flash}</div> : null}
      {error ? <div className="flash error">{error}</div> : null}

      {items.map((item) => {
        const categoryId = picked[item.id] ?? "";
        const canApply = Boolean(categoryId) && busy !== item.id;
        return (
          <div key={item.id} className="panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{item.payee}</strong>
                <div className="stat muted">
                  {item.date} · {item.accountName} ·{" "}
                  {(item.amountCents / 100).toFixed(2)}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={categoryId}
                  disabled={busy === item.id}
                  onChange={(e) =>
                    setPicked((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                >
                  <option value="">Choose category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="button"
                  disabled={!canApply}
                  onClick={() => void apply(item.id, false, item.payee)}
                >
                  Apply once
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={!canApply}
                  onClick={() => void apply(item.id, true, item.payee)}
                >
                  Always like this
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
