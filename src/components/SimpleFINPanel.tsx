"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";

// ---------------------------------------------------------------------------
// Types (mirror the API response shapes)
// ---------------------------------------------------------------------------

interface LinkedAccount {
  id: string;
  name: string;
  simpleFinId: string;
  simpleFinLastSyncAt: string | null;
}

interface SFAccount {
  id: string;
  name: string;
  conn_name: string;
  currency: string;
  balance: string;
  balanceDate: number;
  linkedAccount: LinkedAccount | null;
}

interface HLAccount {
  id: string;
  name: string;
  type: string;
}

interface Props {
  connected: boolean;
  hlAccounts: HLAccount[];
  /** True if SIMPLEFIN_TOKEN is set in the server environment. */
  hasEnvToken: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function balanceCents(balance: string) {
  return Math.round(parseFloat(balance) * 100);
}

function relativeTime(isoOrNull: string | null) {
  if (!isoOrNull) return "never";
  const diff = Date.now() - new Date(isoOrNull).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-component: link an SF account to a HL account
// ---------------------------------------------------------------------------

function LinkRow({
  sfAcc,
  hlAccounts,
  onLinked,
}: {
  sfAcc: SFAccount;
  hlAccounts: HLAccount[];
  onLinked: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "existing" | "new">("idle");
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState(sfAcc.name);
  const [newType, setNewType] = useState("CHECKING");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function link() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const body =
        mode === "existing"
          ? { simpleFinId: sfAcc.id, accountId: selectedId }
          : { simpleFinId: sfAcc.id, newAccount: { name: newName, type: newType } };
      const res = await fetch("/api/simplefin/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setErr(d.error ?? "Link failed");
      } else {
        onLinked();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{sfAcc.name}</strong>
        {sfAcc.conn_name && <span className="stat muted" style={{ marginLeft: "0.4rem", fontSize: "0.8rem" }}>{sfAcc.conn_name}</span>}
      </td>
      <td>{formatMoney(balanceCents(sfAcc.balance))}</td>
      <td>
        {mode === "idle" && (
          <span style={{ display: "inline-flex", gap: "0.4rem" }}>
            <button className="btn" style={{ fontSize: "0.8rem" }} onClick={() => setMode("existing")}>
              Link existing
            </button>
            <button className="btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => setMode("new")}>
              Create new
            </button>
          </span>
        )}
        {mode === "existing" && (
          <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— pick account —</option>
              {hlAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button className="btn" style={{ fontSize: "0.8rem" }} onClick={link} disabled={busy || !selectedId}>
              {busy ? "Linking…" : "Link"}
            </button>
            <button className="btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => setMode("idle")}>Cancel</button>
          </span>
        )}
        {mode === "new" && (
          <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Account name"
              style={{ fontSize: "0.85rem", padding: "0.2rem 0.4rem" }}
            />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              {["CHECKING","SAVINGS","CREDIT","INVESTMENT","LOAN","CASH","OTHER"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button className="btn" style={{ fontSize: "0.8rem" }} onClick={link} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create & link"}
            </button>
            <button className="btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => setMode("idle")}>Cancel</button>
          </span>
        )}
        {err && <span style={{ color: "var(--rose)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>{err}</span>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: sync a linked account
// ---------------------------------------------------------------------------

function SyncRow({
  sfAcc,
  onSynced,
}: {
  sfAcc: SFAccount;
  onSynced: (result: { imported: number; skipped: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();

  const linked = sfAcc.linkedAccount!;

  async function sync() {
    if (busy) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch("/api/simplefin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: linked.id }),
      });
      const data = await res.json() as { imported?: number; skipped?: number; error?: string; errors?: { msg: string }[] };
      if (!res.ok) {
        setErr(data.error ?? "Sync failed");
      } else {
        const r = { imported: data.imported ?? 0, skipped: data.skipped ?? 0 };
        setResult(r);
        onSynced(r);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{sfAcc.name}</strong>
        {sfAcc.conn_name && <span className="stat muted" style={{ marginLeft: "0.4rem", fontSize: "0.8rem" }}>{sfAcc.conn_name}</span>}
        <br />
        <span className="stat muted" style={{ fontSize: "0.78rem" }}>→ {linked.name}</span>
      </td>
      <td>{formatMoney(balanceCents(sfAcc.balance))}</td>
      <td>{relativeTime(linked.simpleFinLastSyncAt)}</td>
      <td>
        {result ? (
          <span style={{ color: "var(--ok)", fontSize: "0.85rem" }}>
            +{result.imported} imported, {result.skipped} skipped
          </span>
        ) : (
          <button className="btn" style={{ fontSize: "0.8rem" }} onClick={sync} disabled={busy}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        )}
        {err && <span style={{ color: "var(--rose)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>{err}</span>}
      </td>
      <td>
        <UnlinkButton accountId={linked.id} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Unlink button
// ---------------------------------------------------------------------------

function UnlinkButton({ accountId }: { accountId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function unlink() {
    if (!confirm("Unlink this account from SimpleFIN?")) return;
    setBusy(true);
    await fetch("/api/simplefin/link", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button className="btn-ghost" style={{ fontSize: "0.75rem", color: "var(--muted)" }} onClick={unlink} disabled={busy}>
      Unlink
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SimpleFINPanel({ connected, hlAccounts, hasEnvToken }: Props) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [sfAccounts, setSfAccounts] = useState<SFAccount[] | null>(null);
  const [sfErrors, setSfErrors] = useState<{ msg: string }[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [isConnected, setIsConnected] = useState(connected);
  const [disconnecting, setDisconnecting] = useState(false);

  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (loadingStartedAt === null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - loadingStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [loadingStartedAt]);

  const loadAccounts = useCallback(async () => {
    setLoadErr("");
    setLoadingStartedAt(Date.now());
    setElapsed(0);
    try {
      const res = await fetch("/api/simplefin/accounts");
      const data = await res.json() as { accounts?: SFAccount[]; errors?: { msg: string }[]; error?: string };
      if (!res.ok) {
        setLoadErr(data.error ?? "Failed to load accounts");
      } else {
        setSfAccounts(data.accounts ?? []);
        setSfErrors(data.errors ?? []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error loading accounts";
      setLoadErr(msg.includes("timed out") || msg.includes("abort") ? "SimpleFIN timed out after 90 s. The bridge may be busy — try again in a moment." : msg);
    } finally {
      setLoadingStartedAt(null);
    }
  }, []);

  useEffect(() => {
    if (isConnected) loadAccounts();
  }, [isConnected, loadAccounts]);

  async function connect(tokenOverride?: string) {
    setConnecting(true);
    setConnectErr("");
    try {
      const body = tokenOverride ? { token: tokenOverride } : {};
      const res = await fetch("/api/simplefin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setConnectErr(data.error ?? "Connection failed");
      } else {
        setIsConnected(true);
        router.refresh();
      }
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect SimpleFIN? The stored access URL will be removed. You will need to enter a new token to reconnect.")) return;
    setDisconnecting(true);
    await fetch("/api/simplefin/setup", { method: "DELETE" });
    setDisconnecting(false);
    setIsConnected(false);
    setSfAccounts(null);
    router.refresh();
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ maxWidth: "34rem" }}>
        {/* What is SimpleFIN */}
        <div className="panel" style={{ background: "var(--surface)", marginBottom: "1.25rem", borderLeft: "3px solid var(--accent)" }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>
            What is SimpleFIN Bridge?
          </p>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
            <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">SimpleFIN Bridge</a>{" "}
            connects HomeLedger directly to most US banks and credit unions — no manual
            downloads needed. Transactions sync in seconds.
          </p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
            Cost: <strong style={{ color: "var(--fg)" }}>$1.50/month</strong> or{" "}
            <strong style={{ color: "var(--fg)" }}>$15/year</strong> — paid to SimpleFIN, not HomeLedger.
          </p>
        </div>

        {/* Setup steps */}
        <h3 style={{ margin: "0 0 0.75rem" }}>Connect your banks in 3 steps</h3>
        <ol style={{ lineHeight: 2, paddingLeft: "1.25rem", margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
          <li>
            <a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noopener noreferrer">
              Create a SimpleFIN account
            </a>{" "}
            and get your <strong>Setup Token</strong>.
          </li>
          <li>
            Add any banks you want to sync at{" "}
            <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">
              bridge.simplefin.org
            </a>.
          </li>
          <li>Paste your Setup Token below and click <strong>Connect</strong>.</li>
        </ol>

        {/* Token input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label htmlFor="sf-token-input" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
            Setup Token
          </label>
          <textarea
            id="sf-token-input"
            rows={3}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste your SimpleFIN Setup Token here…"
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.78rem",
              padding: "0.5rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--fg)",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() => connect(tokenInput.trim() || undefined)}
              disabled={connecting || (!tokenInput.trim() && !hasEnvToken)}
            >
              {connecting ? "Connecting…" : "Connect SimpleFIN"}
            </button>
            {hasEnvToken && !tokenInput.trim() && (
              <span className="stat muted" style={{ fontSize: "0.82rem" }}>
                or use the token already set in <code>.env</code>
              </span>
            )}
          </div>

          {connectErr && (
            <p style={{ color: "var(--rose)", margin: 0, fontSize: "0.88rem" }}>{connectErr}</p>
          )}
        </div>

        <p className="tip" style={{ marginTop: "1rem" }}>
          The token is used once to claim an Access URL, which is stored securely in your
          local database. The raw token is not saved.
        </p>
      </div>
    );
  }

  // Connected but still loading or errored before accounts loaded
  if (sfAccounts === null && !loadErr) {
    return (
      <div>
        <p className="stat muted">
          Connecting to SimpleFIN Bridge… {loadingStartedAt !== null && elapsed > 0 ? `(${elapsed}s)` : ""}
        </p>
        {elapsed >= 10 && (
          <p className="tip" style={{ marginTop: "0.25rem" }}>
            The bridge is authenticating with your banks — this can take up to 90 seconds on the first request.
          </p>
        )}
      </div>
    );
  }

  if (loadErr) {
    return (
      <div>
        <p style={{ color: "var(--rose)" }}>{loadErr}</p>
        <button className="btn-ghost" onClick={loadAccounts}>Retry</button>
      </div>
    );
  }

  if (!sfAccounts) return null;

  const linked = sfAccounts.filter((a) => a.linkedAccount !== null);
  const unlinked = sfAccounts.filter((a) => a.linkedAccount === null);

  return (
    <div>
      {sfErrors.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--amber)" }}>
          <p style={{ margin: 0, color: "var(--amber)", fontSize: "0.9rem" }}>
            SimpleFIN reported issues with some connections:
          </p>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
            {sfErrors.map((e, i) => <li key={i}>{e.msg}</li>)}
          </ul>
        </div>
      )}

      {/* Linked accounts – show sync table */}
      {linked.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Linked accounts</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>SimpleFIN → HomeLedger</th>
                  <th>Balance</th>
                  <th>Last sync</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linked.map((sfAcc) => (
                  <SyncRow
                    key={sfAcc.id}
                    sfAcc={sfAcc}
                    onSynced={() => loadAccounts()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Unlinked SimpleFIN accounts */}
      {unlinked.length > 0 && (
        <section>
          <h3 style={{ marginTop: 0 }}>Available accounts</h3>
          <p className="tip">
            Link each SimpleFIN account to a HomeLedger account to start syncing.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>SimpleFIN account</th>
                  <th>Balance</th>
                  <th>Link to HomeLedger</th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map((sfAcc) => (
                  <LinkRow
                    key={sfAcc.id}
                    sfAcc={sfAcc}
                    hlAccounts={hlAccounts}
                    onLinked={() => loadAccounts()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sfAccounts.length === 0 && (
        <p className="tip">
          No accounts returned from SimpleFIN Bridge. Make sure you have connected at least one
          institution at{" "}
          <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">
            bridge.simplefin.org
          </a>
          .
        </p>
      )}

      {/* Disconnect option */}
      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.8rem", color: "var(--muted)" }}
          onClick={disconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect SimpleFIN"}
        </button>
        <span className="stat muted" style={{ fontSize: "0.78rem", marginLeft: "0.75rem" }}>
          Removes the stored access URL. Existing imported transactions are not affected.
        </span>
      </div>
    </div>
  );
}
