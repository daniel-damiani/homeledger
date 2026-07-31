"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["CHECKING", "SAVINGS", "CREDIT", "CASH", "INVESTMENT", "OTHER"] as const;

export function AccountForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create account");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New account</h2>
      {error ? <div className="flash error">{error}</div> : null}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required placeholder="Everyday checking" />
      </div>
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue="CHECKING">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="institution">Institution</label>
        <input id="institution" name="institution" placeholder="Chase" />
      </div>
      <div className="field">
        <label htmlFor="balance">Starting balance</label>
        <input id="balance" name="balance" type="number" step="0.01" defaultValue="0" />
      </div>
      <button className="btn" type="submit">
        Create account
      </button>
    </form>
  );
}