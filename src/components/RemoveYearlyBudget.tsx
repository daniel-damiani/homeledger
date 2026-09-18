"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveYearlyBudget({
  year,
  categoryId,
  categoryName,
}: {
  year: number;
  categoryId: string;
  categoryName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRemove() {
    if (busy) return;
    if (!window.confirm(`Remove the ${year} yearly budget for ${categoryName}?`)) return;
    setBusy(true);
    try {
      await fetch("/api/budgets/yearly", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, categoryId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-ghost" type="button" disabled={busy} onClick={() => void onRemove()} style={{ fontSize: "0.78rem" }}>
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}
