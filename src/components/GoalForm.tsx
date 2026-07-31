"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function GoalForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        target: fd.get("target"),
        current: fd.get("current"),
        targetDate: fd.get("targetDate") || null,
      }),
    });
    if (!res.ok) {
      setError("Could not create goal");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New goal</h2>
      {error ? <div className="flash error">{error}</div> : null}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required placeholder="Emergency fund" />
      </div>
      <div className="field">
        <label htmlFor="target">Target ($)</label>
        <input id="target" name="target" type="number" step="0.01" min="1" required />
      </div>
      <div className="field">
        <label htmlFor="current">Current ($)</label>
        <input id="current" name="current" type="number" step="0.01" min="0" defaultValue="0" />
      </div>
      <div className="field">
        <label htmlFor="targetDate">Target date</label>
        <input id="targetDate" name="targetDate" type="date" />
      </div>
      <button className="btn" type="submit">
        Create goal
      </button>
    </form>
  );
}