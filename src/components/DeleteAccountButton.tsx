"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAccountButton({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (busy) return;
    const ok = window.confirm(
      `Remove “${accountName}”? This permanently deletes the account and all of its transactions and import batches.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not remove account");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn danger" type="button" disabled={busy} onClick={onDelete}>
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}