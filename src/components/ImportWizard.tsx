"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewRow = {
  date: string;
  payee: string;
  memo?: string;
  amountCents: number;
  externalId: string;
};

type PreviewResponse = {
  format: string;
  preset: string;
  headers?: string[];
  preambleSkipped?: number;
  warning?: string;
  rows: PreviewRow[];
  presets: string[];
};

const DEFAULT_PRESETS = [
  "generic",
  "chase",
  "chase-credit",
  "amex",
  "capital-one",
  "bank-of-america",
];

export function ImportWizard({
  accounts,
}: {
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [preset, setPreset] = useState("chase");
  const [amountSign, setAmountSign] = useState("as-is");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setError("");
    setResult("");
    setPreview(null);
  }, []);

  async function runPreview() {
    if (!file || !accountId) {
      setError("Choose an account and a file");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("preset", preset);
      fd.set("amountSign", amountSign);
      fd.set("mode", "preview");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Preview failed");
        return;
      }
      setPreview(data);
      if (data.preset) setPreset(data.preset);
      if (data.warning) setError(data.warning);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file || !accountId || !preview) return;
    if (preview.rows.length === 0) {
      setError("Nothing to import — fix the preset or use a CSV download from Chase.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("accountId", accountId);
      fd.set("preset", preset);
      fd.set("amountSign", amountSign);
      fd.set("mode", "commit");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }
      setResult(
        `Imported ${data.importedCount}, skipped ${data.skippedCount} (batch ${data.id})`
      );
      setPreview(null);
      setFile(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const total = useMemo(
    () => preview?.rows.reduce((s, r) => s + r.amountCents, 0) ?? 0,
    [preview]
  );

  if (accounts.length === 0) {
    return (
      <section className="panel empty-cta">
        <h2>Create an account first</h2>
        <p className="lede">Imports need somewhere to land.</p>
        <a className="btn" href="/accounts">
          Go to Accounts
        </a>
      </section>
    );
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="panel">
        <h2>Import a statement</h2>
        <p className="lede">
          Prefer Chase <strong>CSV</strong> (Download activity), not the PDF statement. Preview before
          commit. Duplicates are skipped.
        </p>
        {error ? <div className="flash error">{error}</div> : null}
        {result ? <div className="flash">{result}</div> : null}

        <div className="field">
          <label htmlFor="accountId">Account</label>
          <select
            id="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
        >
          <p>{file ? file.name : "Drag & drop a statement, or choose a file"}</p>
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.pdf,.txt,text/csv,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>

        <div className="grid cols-3" style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="preset">CSV preset</label>
            <select id="preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {(preview?.presets?.length ? preview.presets : DEFAULT_PRESETS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amountSign">Amount sign</label>
            <select
              id="amountSign"
              value={amountSign}
              onChange={(e) => setAmountSign(e.target.value)}
            >
              <option value="as-is">As-is (use preset)</option>
              <option value="invert">Invert signs</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button className="btn secondary" type="button" disabled={busy || !file} onClick={runPreview}>
            Preview
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !preview || preview.rows.length === 0}
            onClick={commit}
          >
            Commit import
          </button>
        </div>
      </section>

      {preview ? (
        <section className="panel">
          <h2>
            Preview · {preview.format.toUpperCase()} · preset {preview.preset} ·{" "}
            {preview.rows.length} rows · net {(total / 100).toFixed(2)}
          </h2>
          {preview.headers?.length ? (
            <p className="stat muted">
              Columns: {preview.headers.join(", ")}
              {preview.preambleSkipped
                ? ` · skipped ${preview.preambleSkipped} header line(s)`
                : ""}
            </p>
          ) : null}
          {preview.rows.length === 0 ? (
            <p>
              No transactions parsed. For Chase credit cards, pick <code>chase-credit</code> and use
              the CSV download (not PDF). If this still fails, share the first header line of the
              file (column names only — no amounts).
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Memo</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.externalId}>
                      <td>{r.date}</td>
                      <td>{r.payee}</td>
                      <td>{r.memo ?? ""}</td>
                      <td className={r.amountCents < 0 ? "amount neg" : "amount pos"}>
                        {(r.amountCents / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}