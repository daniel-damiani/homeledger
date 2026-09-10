"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SweepButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");

  return (
    <button
      className="btn secondary"
      type="button"
      onClick={async () => {
        const res = await fetch("/api/goals/sweep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(data.error || "Sweep failed");
          return;
        }
        setMsg(`Swept $${(data.sweptCents / 100).toFixed(2)}`);
        router.refresh();
      }}
    >
      Sweep surplus {msg ? `· ${msg}` : ""}
    </button>
  );
}