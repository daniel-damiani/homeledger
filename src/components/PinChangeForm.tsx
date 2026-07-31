"use client";

import { FormEvent, useState } from "react";

export function PinChangeForm() {
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/settings/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPin: fd.get("currentPin"),
        newPin: fd.get("newPin"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not change PIN");
      return;
    }
    setMsg("PIN updated");
    e.currentTarget.reset();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Change PIN</h2>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? <div className="flash">{msg}</div> : null}
      <div className="field">
        <label htmlFor="currentPin">Current PIN</label>
        <input id="currentPin" name="currentPin" type="password" required />
      </div>
      <div className="field">
        <label htmlFor="newPin">New PIN (4+ digits)</label>
        <input id="newPin" name="newPin" type="password" minLength={4} required />
      </div>
      <button className="btn" type="submit">
        Update PIN
      </button>
    </form>
  );
}