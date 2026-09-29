"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = {
  id: string;
  payee: string;
  date: string;
  amountCents: number;
  accountName: string;
  categoryId?: string | null;
  categoryName?: string | null;
};

export function CategorizeQueue({
  items,
  categories,
  onItemApplied,
  onItemsApplied,
  onQueueEmpty,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
  /** When set (e.g. post-sync modal), rows drop locally after Apply without a full refresh. */
  onItemApplied?: (txnId: string) => void;
  onItemsApplied?: (txnIds: string[]) => void;
  onQueueEmpty?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  function selectedCategoryId(txnId: string, item: Item): string {
    return picked[txnId] ?? item.categoryId ?? "";
  }

  async function apply(txnId: string, always: boolean, payee: string, categoryIdOverride?: string) {
    const categoryId = categoryIdOverride ?? picked[txnId] ?? items.find((i) => i.id === txnId)?.categoryId;
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
      if (onItemApplied) {
        onItemApplied(txnId);
        if (items.length <= 1) onQueueEmpty?.();
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function confirmAllPrefilled() {
    const toConfirm = items.filter((item) => selectedCategoryId(item.id, item));
    if (toConfirm.length === 0) return;
    setBusy("bulk");
    try {
      for (const item of toConfirm) {
        const categoryId = selectedCategoryId(item.id, item);
        await fetch("/api/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txnId: item.id, categoryId, always: false, payee: item.payee }),
        });
      }
      const ids = toConfirm.map((item) => item.id);
      if (onItemsApplied) {
        onItemsApplied(ids);
        if (items.length <= ids.length) onQueueEmpty?.();
      } else if (onItemApplied) {
        for (const id of ids) onItemApplied(id);
        if (items.length <= ids.length) onQueueEmpty?.();
      } else {
        router.refresh();
      }
      setPicked((prev) => {
        const next = { ...prev };
        for (const item of toConfirm) delete next[item.id];
        return next;
      });
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

  const prefilledCount = items.filter((item) => selectedCategoryId(item.id, item)).length;

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
        {onItemApplied && prefilledCount > 1 ? (
          <button
            className="btn secondary"
            type="button"
            disabled={busy !== null}
            onClick={() => void confirmAllPrefilled()}
          >
            {busy === "bulk" ? "Confirming…" : `Confirm all pre-filled (${prefilledCount})`}
          </button>
        ) : null}
        <span className="stat muted">
          Auto-assigned categories are pre-selected — Apply once to keep or change first.
        </span>
      </div>
      {flash ? <div className="flash">{flash}</div> : null}
      {error ? <div className="flash error">{error}</div> : null}

      {items.map((item) => {
        const categoryId = selectedCategoryId(item.id, item);
        const canApply = Boolean(categoryId) && busy !== item.id && busy !== "bulk";
        const autoAssigned = Boolean(item.categoryId && !picked[item.id]);
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
                  {autoAssigned && item.categoryName ? (
                    <> · auto: {item.categoryName}</>
                  ) : null}
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
