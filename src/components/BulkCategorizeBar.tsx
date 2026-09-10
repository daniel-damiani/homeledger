"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BulkCategorizeBar({
  txnIds,
  categories,
  totalMatches,
  pageSize,
}: {
  txnIds: string[];
  categories: { id: string; name: string }[];
  totalMatches: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const hasMore = totalMatches > pageSize;

  async function apply() {
    if (!categoryId) {
      setError("Pick a category first.");
      return;
    }
    setBusy(true);
    setError("");
    setFlash("");
    const resolvedId = categoryId === "__clear__" ? null : categoryId;
    try {
      const res = await fetch("/api/transactions/bulk-categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txnIds, categoryId: resolvedId }),
      });
      const data = (await res.json()) as { updated?: number; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setFlash(`Updated ${data.updated ?? txnIds.length} transaction${(data.updated ?? txnIds.length) === 1 ? "" : "s"}.`);
      router.refresh();
    } catch {
      setError("Could not reach server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.65rem",
        alignItems: "center",
        padding: "0.75rem 0",
        borderBottom: "1px solid var(--line)",
        marginBottom: "0.5rem",
      }}
    >
      <span className="stat muted" style={{ fontSize: "0.9rem" }}>
        Apply to {txnIds.length} on this page
        {hasMore ? (
          <> · <em>{totalMatches - txnIds.length} more match{totalMatches - txnIds.length === 1 ? "" : "es"} on other pages</em></>
        ) : null}
        :
      </span>
      <select
        value={categoryId}
        disabled={busy}
        onChange={(e) => { setCategoryId(e.target.value); setFlash(""); setError(""); }}
        style={{
          font: "inherit",
          fontSize: "0.88rem",
          color: "var(--ink)",
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "0.3rem 0.5rem",
        }}
      >
        <option value="">— pick category —</option>
        <option value="__clear__">— clear (remove category) —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="btn" type="button" disabled={busy || !categoryId} onClick={() => void apply()}>
        {busy ? "Applying…" : "Apply to all on page"}
      </button>
      {flash ? <span className="stat muted">{flash}</span> : null}
      {error ? <span style={{ color: "var(--rose)", fontSize: "0.9rem" }}>{error}</span> : null}
    </div>
  );
}
