"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

type Status = {
  available: boolean;
  model: string;
  models: string[];
  error?: string;
};

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/chat/status");
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) {
          setStatus({
            available: false,
            model: "",
            models: [],
            error: "Could not reach chat status",
          });
        }
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Chat failed");
        return;
      }
      setMessages([...next, { role: "assistant", content: String(data.reply || "") }]);
    } catch {
      setError("Network error talking to assistant");
    } finally {
      setBusy(false);
    }
  }

  const offline = status && !status.available;

  return (
    <>
      <button
        type="button"
        className="chat-fab"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "×" : "Ask"}
      </button>

      {open ? (
        <aside className="chat-drawer" aria-label="HomeLedger assistant">
          <header className="chat-drawer-head">
            <div>
              <strong>Assistant</strong>
              <div className="stat muted" style={{ fontSize: "0.85rem" }}>
                {status?.available
                  ? `Ollama · ${status.model}`
                  : status?.error || "Checking Ollama…"}
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "0.35rem 0.75rem" }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>

          <div className="chat-drawer-body">
            {offline ? (
              <p className="lede">
                Start Ollama on this PC, pull a tool-capable model (e.g.{" "}
                <code>ollama pull llama3.2</code>), and ensure Docker can reach{" "}
                <code>host.docker.internal:11434</code>. Set <code>OLLAMA_MODEL</code> in{" "}
                <code>.env</code> if needed.
              </p>
            ) : null}
            {messages.length === 0 && !offline ? (
              <p className="lede">
                Ask about balances, spending, budgets, or how HomeLedger works. I can query your
                local data.
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy ? <div className="chat-bubble assistant muted">Thinking…</div> : null}
            {error ? <div className="flash error">{error}</div> : null}
            <div ref={bottomRef} />
          </div>

          <form className="chat-drawer-foot" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={offline ? "Ollama offline" : "What’s my net worth?"}
              disabled={busy || Boolean(offline)}
              aria-label="Message"
            />
            <button className="btn" type="submit" disabled={busy || Boolean(offline) || !input.trim()}>
              Send
            </button>
          </form>
        </aside>
      ) : null}
    </>
  );
}
