"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UndoBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="btn danger"
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Undo this import batch?")) return;
        setBusy(true);
        await fetch(`/api/import/${batchId}`, { method: "DELETE" });
        setBusy(false);
        router.refresh();
      }}
    >
      Undo
    </button>
  );
}