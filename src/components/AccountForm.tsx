"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["CHECKING", "SAVINGS", "CREDIT", "LOAN", "CASH", "INVESTMENT", "OTHER"] as const;

export function AccountForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          type: fd.get("type"),
          institution: fd.get("institution") || undefined,
          balance: fd.get("balance"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create account");
        return;
      }
      const name = String(data.name || fd.get("name") || "Account");
      setSuccess(`Created “${name}”.`);
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New account</h2>
      {error ? <div className="flash error">{error}</div> : null}
      {success ? <div className="flash">{success}</div> : null}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required placeholder="Everyday checking" disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue="CHECKING" disabled={busy}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="institution">Institution</label>
        <input id="institution" name="institution" placeholder="Chase" disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="balance">Starting balance</label>
        <input
          id="balance"
          name="balance"
          type="number"
          step="0.01"
          defaultValue="0"
          disabled={busy}
        />
        <span className="stat muted">
          Checking/savings: balance before imports. LOAN/CREDIT: amount currently owed.
        </span>
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}