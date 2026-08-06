"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  accountId: string;
  initialUrl: string | null;
}

export function AccountDownloadLink({ accountId, initialUrl }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadUrl: draft.trim() || null }),
      });
      if (res.ok) {
        setUrl(draft.trim());
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(url);
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem" }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="https://bank.com/download"
          disabled={busy}
          style={{ flex: 1, fontSize: "0.8rem", padding: "0.25rem 0.4rem" }}
        />
        <button
          className="btn"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
          onClick={save}
          disabled={busy}
        >
          {busy ? "…" : "Save"}
        </button>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.4rem" }}
          onClick={cancel}
          disabled={busy}
        >
          ✕
        </button>
      </div>
    );
  }

  if (url) {
    let display: string;
    try {
      const u = new URL(url);
      display = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      display = url.length > 40 ? url.slice(0, 40) + "…" : url;
    }

    return (
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.8rem", color: "var(--accent)" }}
          title={url}
        >
          ↓ {display}
        </a>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.15rem 0.35rem", color: "var(--muted)" }}
          onClick={() => { setDraft(url); setEditing(true); }}
          title="Edit download link"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <button
        className="btn-ghost"
        style={{ fontSize: "0.75rem", padding: "0.25rem 0.4rem", color: "var(--muted)" }}
        onClick={() => { setDraft(""); setEditing(true); }}
        title="Add download link"
      >
        + download link
      </button>
    </div>
  );
}
